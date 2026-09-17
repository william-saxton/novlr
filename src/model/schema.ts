import type { NodeTypeDef, Schema, SchemaPreset } from "./types";

export const TYPE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const RESERVED_TYPE_IDS = new Set(["children"]);

export const NOVEL_SCHEMA: Schema = {
	rootType: "novel",
	types: [
		{ id: "novel", name: "Novel", kind: "container", allowedChildren: ["chapter"], icon: "book" },
		{ id: "chapter", name: "Chapter", kind: "container", allowedChildren: ["scene"], icon: "folder" },
		{ id: "scene", name: "Scene", kind: "content", icon: "file-text" },
	],
};

export const NOVEL_WITH_PARTS_SCHEMA: Schema = {
	rootType: "novel",
	types: [
		{ id: "novel", name: "Novel", kind: "container", allowedChildren: ["part"], icon: "book" },
		{ id: "part", name: "Part", kind: "container", allowedChildren: ["chapter"], icon: "library" },
		{ id: "chapter", name: "Chapter", kind: "container", allowedChildren: ["scene"], icon: "folder" },
		{ id: "scene", name: "Scene", kind: "content", icon: "file-text" },
	],
};

export const SHORT_STORY_SCHEMA: Schema = {
	rootType: "story",
	types: [
		{ id: "story", name: "Story", kind: "container", allowedChildren: ["scene"], icon: "book" },
		{ id: "scene", name: "Scene", kind: "content", icon: "file-text" },
	],
};

export const BUILTIN_PRESETS: SchemaPreset[] = [
	{ name: "Novel", schema: NOVEL_SCHEMA },
	{ name: "Novel with parts", schema: NOVEL_WITH_PARTS_SCHEMA },
	{ name: "Short story", schema: SHORT_STORY_SCHEMA },
];

export function cloneSchema(schema: Schema): Schema {
	return {
		rootType: schema.rootType,
		types: schema.types.map((t) => ({
			...t,
			allowedChildren: t.allowedChildren ? [...t.allowedChildren] : undefined,
		})),
	};
}

export function typeById(schema: Schema, id: string): NodeTypeDef | undefined {
	return schema.types.find((t) => t.id === id);
}

export function isContainer(schema: Schema, typeId: string): boolean {
	return typeById(schema, typeId)?.kind === "container";
}

/** True when a node of `parentTypeId` may directly hold a node of `childTypeId`. */
export function canContain(schema: Schema, parentTypeId: string, childTypeId: string): boolean {
	const parent = typeById(schema, parentTypeId);
	if (!parent || parent.kind !== "container") return false;
	if (!typeById(schema, childTypeId)) return false;
	if (!parent.allowedChildren || parent.allowedChildren.length === 0) return true;
	return parent.allowedChildren.includes(childTypeId);
}

/** Types a container of `parentTypeId` may hold, in schema order. */
export function allowedChildTypes(schema: Schema, parentTypeId: string): NodeTypeDef[] {
	return schema.types.filter((t) => canContain(schema, parentTypeId, t.id));
}

/** Convert a display name into a type id slug. */
export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/^[^a-z]+/, "");
	return slug.length > 0 ? slug : "type";
}

/** Returns a list of problems; empty means valid. */
export function validateSchema(schema: Schema): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	if (schema.types.length === 0) errors.push("A schema needs at least one type.");
	for (const t of schema.types) {
		if (!TYPE_ID_PATTERN.test(t.id)) errors.push(`Type id "${t.id}" must match ${TYPE_ID_PATTERN.source}.`);
		if (RESERVED_TYPE_IDS.has(t.id)) errors.push(`Type id "${t.id}" is reserved.`);
		if (ids.has(t.id)) errors.push(`Duplicate type id "${t.id}".`);
		ids.add(t.id);
		if (t.name.trim().length === 0) errors.push(`Type "${t.id}" needs a name.`);
		if (t.kind !== "container" && t.kind !== "content") errors.push(`Type "${t.id}" has an unknown kind.`);
		if (t.kind === "content" && t.allowedChildren && t.allowedChildren.length > 0) {
			errors.push(`Content type "${t.id}" cannot declare allowed children.`);
		}
	}
	for (const t of schema.types) {
		for (const c of t.allowedChildren ?? []) {
			if (!ids.has(c)) errors.push(`Type "${t.id}" allows unknown child type "${c}".`);
		}
	}
	const root = typeById(schema, schema.rootType);
	if (!root) errors.push(`Root type "${schema.rootType}" is not defined.`);
	else if (root.kind !== "container") errors.push(`Root type "${schema.rootType}" must be a container.`);
	if (!schema.types.some((t) => t.kind === "content")) errors.push("A schema needs at least one content type.");
	return errors;
}

/** First content type a container may hold, used as the default when adding unknown files. */
export function defaultContentType(schema: Schema, parentTypeId: string): string | undefined {
	return allowedChildTypes(schema, parentTypeId).find((t) => t.kind === "content")?.id
		?? schema.types.find((t) => t.kind === "content")?.id;
}

export function defaultContainerType(schema: Schema, parentTypeId: string): string | undefined {
	return allowedChildTypes(schema, parentTypeId).find((t) => t.kind === "container")?.id
		?? schema.types.find((t) => t.kind === "container" && t.id !== schema.rootType)?.id;
}
