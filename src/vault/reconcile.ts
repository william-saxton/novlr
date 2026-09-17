import { compileGlobs, matchesAny } from "../model/glob";
import { isMarkdown } from "../model/paths";
import { walk } from "../model/tree";
import type { ProjectNode, UnknownEntry } from "../model/types";

export interface DiskEntry {
	/** Relative to the project root folder. */
	path: string;
	isFolder: boolean;
	/** Value of `novelr-type` frontmatter for markdown files, if present. */
	guessedType?: string;
}

export interface ReconcileResult {
	unknown: UnknownEntry[];
	missing: string[];
}

/**
 * Compare the index tree with a flat recursive listing of the root folder.
 * Pure: the caller supplies the listing. Only markdown files and folders are considered.
 */
export function reconcile(
	root: ProjectNode,
	entries: DiskEntry[],
	ignore: string[],
	indexRelativePath: string,
): ReconcileResult {
	const globs = compileGlobs(ignore);
	const known = new Map<string, ProjectNode>();
	walk(root, (node) => {
		if (node.path !== "") known.set(node.path, node);
	});

	const onDisk = new Map<string, DiskEntry>();
	for (const e of entries) {
		if (e.path === "" || e.path === indexRelativePath) continue;
		if (!e.isFolder && !isMarkdown(e.path)) continue;
		onDisk.set(e.path, e);
	}

	const missing: string[] = [];
	for (const [path, node] of known) {
		const disk = onDisk.get(path);
		if (!disk || disk.isFolder !== (node.kind === "container")) missing.push(path);
	}

	const unknown: UnknownEntry[] = [];
	const sorted = [...onDisk.values()].sort((a, b) => a.path.localeCompare(b.path));
	const unknownFolders: string[] = [];
	for (const e of sorted) {
		if (matchesAny(globs, e.path)) continue;
		if (unknownFolders.some((f) => e.path.startsWith(f + "/"))) continue;
		const node = known.get(e.path);
		if (node && (node.kind === "container") === e.isFolder) continue;
		// Only folders that are tree containers can host known children; anything under a content node is unknown too.
		unknown.push({ path: e.path, isFolder: e.isFolder, ...(e.guessedType ? { guessedType: e.guessedType } : {}) });
		if (e.isFolder) unknownFolders.push(e.path);
	}

	return { unknown, missing };
}
