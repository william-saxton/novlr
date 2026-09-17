/** A node type is either a folder (container) or a markdown file (content). */
export type NodeKind = "container" | "content";

export interface NodeTypeDef {
	/** Slug matching ^[a-z][a-z0-9-]*$; never "children". Stable key used in the index and in file frontmatter. */
	id: string;
	/** Display name in sentence case, e.g. "Chapter". */
	name: string;
	kind: NodeKind;
	/** Container only. Undefined or empty = any type allowed. */
	allowedChildren?: string[];
	/** Lucide icon id used by setIcon(). */
	icon?: string;
}

export interface Schema {
	/** Type id of the project root folder. Must be a container type. */
	rootType: string;
	types: NodeTypeDef[];
}

export interface SchemaPreset {
	name: string;
	schema: Schema;
}

export interface ProjectNode {
	typeId: string;
	/** Folder name or file basename without ".md". */
	name: string;
	/** Path relative to the project root folder; "" for the root. Content paths end in ".md". */
	path: string;
	/** Always empty for content nodes. */
	children: ProjectNode[];
}

/** One entry of the serialized tree: `{ [typeId]: name, children?: TreeEntry[] }`. */
export type TreeEntry = Record<string, string | TreeEntry[]>;

/** Exactly what is persisted under the `novelr` frontmatter key. */
export interface ProjectFrontmatter {
	version: 1;
	title: string;
	schema: Schema;
	workflow?: string;
	ignore?: string[];
	tree: TreeEntry[];
}

export interface UnknownEntry {
	/** Relative to the project root. */
	path: string;
	isFolder: boolean;
	/** From the file's `novelr-type` frontmatter, if any. */
	guessedType?: string;
}

/** Runtime project object held in the store. */
export interface Project {
	/** Vault path of the index note. */
	indexPath: string;
	/** Vault path of the folder containing the index note; "" for the vault root. */
	rootFolder: string;
	title: string;
	schema: Schema;
	/** typeId = schema.rootType, name = root folder basename, path = "". */
	root: ProjectNode;
	workflow: string | null;
	ignore: string[];
	/** Derived: on disk under the root, not in the tree, not ignored, not the index note. */
	unknown: UnknownEntry[];
	/** Derived: in the tree but not on disk (relative paths). */
	missing: string[];
	/** Parse warnings for the UI (unknown types, malformed entries). */
	warnings: string[];
}

export interface ParseWarning {
	message: string;
}
