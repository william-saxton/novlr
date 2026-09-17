import { basename, dirname, stripMd } from "../model/paths";
import { findByPath, insertChild, recomputePaths, removeByPath } from "../model/tree";
import type { Project } from "../model/types";

/**
 * Reflect a vault rename/move in the tree. Paths are relative to the project root;
 * `newRel` is null when the file left the project. Returns true when the tree changed.
 * Pure apart from mutating `project.root`.
 */
export function applyRename(project: Project, oldRel: string, newRel: string | null): boolean {
	const root = project.root;
	const node = findByPath(root, oldRel);
	if (!node) return false; // either not tracked, or a descendant of an already-applied folder rename
	if (newRel === null || newRel === "") {
		removeByPath(root, oldRel);
		return true;
	}
	const newDir = dirname(newRel);
	const newName = node.kind === "content" ? stripMd(basename(newRel)) : basename(newRel);
	if (newDir === dirname(oldRel)) {
		node.name = newName;
		recomputePaths(node, newDir);
		return true;
	}
	const newParent = findByPath(root, newDir);
	removeByPath(root, oldRel);
	if (newParent && newParent.kind === "container") {
		node.name = newName;
		insertChild(newParent, node);
	}
	return true;
}
