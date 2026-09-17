import { basename, dirname, stripMd } from "./paths";
import { RESERVED_TYPE_IDS, typeById, validateSchema } from "./schema";
import { recomputePaths } from "./tree";
import type { NodeKind, Project, ProjectFrontmatter, ProjectNode, Schema, TreeEntry } from "./types";

export const FRONTMATTER_KEY = "novelr";
export const NODE_TYPE_KEY = "novelr-type";
export const SKIP_KEY = "novelr-skip";

export interface ParseResult {
	project: Project | null;
	warnings: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

function parseSchema(raw: unknown, warnings: string[]): Schema | null {
	if (!isRecord(raw)) {
		warnings.push("Missing or malformed schema.");
		return null;
	}
	const rootType = asString(raw["rootType"]);
	const rawTypes = raw["types"];
	if (!rootType || !Array.isArray(rawTypes)) {
		warnings.push("Schema needs rootType and types.");
		return null;
	}
	const types = rawTypes.flatMap((t): Schema["types"] => {
		if (!isRecord(t)) {
			warnings.push("Ignored malformed type entry.");
			return [];
		}
		const id = asString(t["id"]);
		const name = asString(t["name"]) ?? id;
		const kind = t["kind"];
		if (!id || !name || (kind !== "container" && kind !== "content")) {
			warnings.push(`Ignored type entry with missing id, name or kind${id ? ` ("${id}")` : ""}.`);
			return [];
		}
		const allowed = Array.isArray(t["allowedChildren"])
			? t["allowedChildren"].filter((c): c is string => typeof c === "string")
			: undefined;
		const icon = asString(t["icon"]);
		return [{ id, name, kind, ...(allowed && allowed.length > 0 ? { allowedChildren: allowed } : {}), ...(icon ? { icon } : {}) }];
	});
	const schema: Schema = { rootType, types };
	for (const problem of validateSchema(schema)) warnings.push(`Schema: ${problem}`);
	return schema;
}

function defaultKindFor(typeId: string, schema: Schema, hasChildren: boolean): NodeKind {
	const def = typeById(schema, typeId);
	if (def) return def.kind;
	return hasChildren ? "container" : "content";
}

function parseTree(raw: unknown, schema: Schema, warnings: string[], where: string): ProjectNode[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) {
		warnings.push(`Expected a list under ${where}.`);
		return [];
	}
	const fallbackContent = schema.types.find((t) => t.kind === "content")?.id ?? "content";
	const nodes: ProjectNode[] = [];
	const seen = new Set<string>();
	for (const entry of raw) {
		let typeId: string;
		let name: string;
		let rawChildren: unknown;
		if (typeof entry === "string") {
			typeId = fallbackContent;
			name = entry;
			rawChildren = undefined;
			warnings.push(`"${entry}" in ${where} has no type; treated as ${typeId}.`);
		} else if (isRecord(entry)) {
			const keys = Object.keys(entry).filter((k) => k !== "children");
			const key = keys[0];
			if (keys.length !== 1 || key === undefined || RESERVED_TYPE_IDS.has(key)) {
				warnings.push(`Ignored malformed entry in ${where} (expected exactly one type key).`);
				continue;
			}
			const value = entry[key];
			if (typeof value !== "string") {
				warnings.push(`Ignored entry "${key}" in ${where}: name must be text.`);
				continue;
			}
			typeId = key;
			name = value;
			rawChildren = entry["children"];
		} else {
			warnings.push(`Ignored malformed entry in ${where}.`);
			continue;
		}
		const lower = name.toLowerCase();
		if (seen.has(lower)) {
			warnings.push(`Duplicate name "${name}" in ${where}; kept the first.`);
			continue;
		}
		seen.add(lower);
		const hasChildren = Array.isArray(rawChildren) && rawChildren.length > 0;
		if (!typeById(schema, typeId)) warnings.push(`"${name}" uses unknown type "${typeId}".`);
		const kind = defaultKindFor(typeId, schema, hasChildren);
		const node: ProjectNode = { typeId, kind, name, path: "", children: [] };
		if (kind === "content") {
			if (hasChildren) warnings.push(`"${name}" is a ${typeId} (content) and cannot have children; they were dropped.`);
		} else {
			node.children = parseTree(rawChildren, schema, warnings, `"${name}"`);
		}
		nodes.push(node);
	}
	return nodes;
}

/**
 * Build a Project from an index note path and the raw value of its `novelr` frontmatter key.
 * Never throws; returns `project: null` only when the value is unusable.
 */
export function parseProject(indexPath: string, raw: unknown): ParseResult {
	const warnings: string[] = [];
	if (!isRecord(raw)) return { project: null, warnings: ["The novelr property is not an object."] };
	const schema = parseSchema(raw["schema"], warnings);
	if (!schema) return { project: null, warnings };
	const rootFolder = dirname(indexPath);
	const rootName = rootFolder === "" ? "Vault" : basename(rootFolder);
	const title = asString(raw["title"]) ?? stripMd(basename(indexPath));
	const workflow = asString(raw["workflow"]) ?? null;
	const ignore = Array.isArray(raw["ignore"]) ? raw["ignore"].filter((s): s is string => typeof s === "string") : [];
	const root: ProjectNode = {
		typeId: schema.rootType,
		kind: "container",
		name: rootName,
		path: "",
		children: parseTree(raw["tree"], schema, warnings, "tree"),
	};
	recomputePaths(root, null);
	return {
		project: { indexPath, rootFolder, title, schema, root, workflow, ignore, unknown: [], missing: [], warnings },
		warnings,
	};
}

function serializeTree(nodes: ProjectNode[]): TreeEntry[] {
	return nodes.map((n) => {
		const entry: TreeEntry = { [n.typeId]: n.name };
		if (n.kind === "container" && n.children.length > 0) entry["children"] = serializeTree(n.children);
		return entry;
	});
}

export function serializeProject(project: Project): ProjectFrontmatter {
	const fm: ProjectFrontmatter = {
		version: 1,
		title: project.title,
		schema: {
			rootType: project.schema.rootType,
			types: project.schema.types.map((t) => {
				const out: Schema["types"][number] = { id: t.id, name: t.name, kind: t.kind };
				if (t.allowedChildren && t.allowedChildren.length > 0) out.allowedChildren = [...t.allowedChildren];
				if (t.icon) out.icon = t.icon;
				return out;
			}),
		},
		tree: serializeTree(project.root.children),
	};
	if (project.workflow) fm.workflow = project.workflow;
	if (project.ignore.length > 0) fm.ignore = [...project.ignore];
	return fm;
}

/** Frontmatter block for a brand-new content file. */
export function newContentFileText(typeId: string, writeType: boolean): string {
	return writeType ? `---\n${NODE_TYPE_KEY}: ${typeId}\n---\n\n` : "";
}
