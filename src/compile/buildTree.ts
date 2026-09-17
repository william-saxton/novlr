import type { App } from "obsidian";
import { join } from "../model/paths";
import { SKIP_KEY } from "../model/serialize";
import { computeEffectiveStatuses, statusById } from "../model/status";
import type { Project, ProjectNode } from "../model/types";
import { computeNumbering } from "./numbering";
import type { CompileNode, Numbering } from "./types";

export interface BuiltTree {
	root: CompileNode;
	/** Vault paths of content nodes skipped through `novelr-skip: true`. */
	skipped: string[];
	/** Vault paths of nodes that do not exist on disk. */
	missing: string[];
}

const EMPTY_NUMBERING: Numbering = { index: 0, number: 1, count: 1, absolute: 1, depth: 0, ancestors: [] };

function makeNode(node: ProjectNode, path: string, title: string, status: { id: string; name: string } | null): CompileNode {
	return {
		typeId: node.typeId,
		kind: node.kind,
		title,
		path,
		status,
		frontmatter: {},
		text: "",
		before: [],
		after: [],
		children: [],
		numbering: { ...EMPTY_NUMBERING },
	};
}

/** Read every content file of the project into a compile tree with numbering applied. */
export async function buildCompileTree(app: App, project: Project): Promise<BuiltTree> {
	const skipped: string[] = [];
	const missing: string[] = [];
	const effective = computeEffectiveStatuses(project.root, project.statuses);
	const statusOf = (node: ProjectNode): { id: string; name: string } | null => {
		const id = effective.get(node.path)?.effective;
		if (!id) return null;
		return { id, name: statusById(project.statuses, id)?.name ?? id };
	};

	const build = async (node: ProjectNode): Promise<CompileNode | null> => {
		const vaultPath = join(project.rootFolder, node.path);
		if (node.kind === "content") {
			const file = app.vault.getFileByPath(vaultPath);
			if (!file) {
				missing.push(vaultPath);
				return null;
			}
			const frontmatter = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
			if (frontmatter[SKIP_KEY] === true) {
				skipped.push(vaultPath);
				return null;
			}
			const out = makeNode(node, vaultPath, node.name, statusOf(node));
			out.frontmatter = { ...frontmatter };
			out.text = await app.vault.cachedRead(file);
			return out;
		}
		if (node.path !== "" && !app.vault.getFolderByPath(vaultPath)) missing.push(vaultPath);
		const out = makeNode(node, vaultPath, node.path === "" ? project.title : node.name, statusOf(node));
		for (const child of node.children) {
			const built = await build(child);
			if (built) out.children.push(built);
		}
		return out;
	};

	const root = (await build(project.root)) as CompileNode;
	computeNumbering(root);
	return { root, skipped, missing };
}
