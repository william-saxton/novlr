import { join } from "./paths";
import type { NodeKind, ProjectNode } from "./types";

export type Visitor = (node: ProjectNode, parent: ProjectNode | null, depth: number) => void | false;

/** Pre-order traversal. Returning `false` from the visitor skips that node's children. */
export function walk(root: ProjectNode, visit: Visitor): void {
	const rec = (node: ProjectNode, parent: ProjectNode | null, depth: number): void => {
		if (visit(node, parent, depth) === false) return;
		for (const child of node.children) rec(child, node, depth + 1);
	};
	rec(root, null, 0);
}

export function findByPath(root: ProjectNode, path: string): ProjectNode | undefined {
	let found: ProjectNode | undefined;
	walk(root, (node) => {
		if (found) return false;
		if (node.path === path) {
			found = node;
			return false;
		}
		return undefined;
	});
	return found;
}

export function parentOf(root: ProjectNode, path: string): ProjectNode | undefined {
	if (path === "") return undefined;
	let found: ProjectNode | undefined;
	walk(root, (node, parent) => {
		if (found) return false;
		if (node.path === path) {
			found = parent ?? undefined;
			return false;
		}
		return undefined;
	});
	return found;
}

export function nodePath(parentPath: string, name: string, kind: NodeKind): string {
	return join(parentPath, kind === "content" ? `${name}.md` : name);
}

/** Recompute `path` for `node` and its subtree from names and the parent path. */
export function recomputePaths(node: ProjectNode, parentPath: string | null): void {
	if (parentPath !== null) node.path = nodePath(parentPath, node.name, node.kind);
	for (const child of node.children) recomputePaths(child, node.path);
}

export function insertChild(parent: ProjectNode, child: ProjectNode, index?: number): void {
	const i = index === undefined || index < 0 || index > parent.children.length ? parent.children.length : index;
	parent.children.splice(i, 0, child);
	recomputePaths(child, parent.path);
}

/** Remove and return the node at `path` (never the root). */
export function removeByPath(root: ProjectNode, path: string): ProjectNode | undefined {
	const parent = parentOf(root, path);
	if (!parent) return undefined;
	const i = parent.children.findIndex((c) => c.path === path);
	if (i === -1) return undefined;
	return parent.children.splice(i, 1)[0];
}

export function isDescendantPath(ancestorPath: string, path: string): boolean {
	if (ancestorPath === "") return path !== "";
	return path.startsWith(ancestorPath + "/");
}

/**
 * Move the node at `path` under `newParentPath` at `index` (index is relative to the
 * new parent's children *after* removal). Returns false when the move is impossible
 * (unknown paths, moving into own subtree, new parent is content).
 */
export function moveNode(root: ProjectNode, path: string, newParentPath: string, index: number): boolean {
	if (path === "" || path === newParentPath || isDescendantPath(path, newParentPath)) return false;
	const newParent = findByPath(root, newParentPath);
	if (!newParent || newParent.kind !== "container") return false;
	const node = removeByPath(root, path);
	if (!node) return false;
	insertChild(newParent, node, index);
	return true;
}

export function contentNodes(root: ProjectNode): ProjectNode[] {
	const out: ProjectNode[] = [];
	walk(root, (node) => {
		if (node.kind === "content") out.push(node);
	});
	return out;
}

export function allNodes(root: ProjectNode): ProjectNode[] {
	const out: ProjectNode[] = [];
	walk(root, (node) => {
		out.push(node);
	});
	return out;
}

export function countByType(root: ProjectNode): Map<string, number> {
	const counts = new Map<string, number>();
	walk(root, (node) => {
		counts.set(node.typeId, (counts.get(node.typeId) ?? 0) + 1);
	});
	return counts;
}

export function cloneTree(node: ProjectNode): ProjectNode {
	return {
		typeId: node.typeId,
		kind: node.kind,
		name: node.name,
		path: node.path,
		...(node.status !== undefined ? { status: node.status } : {}),
		children: node.children.map(cloneTree),
	};
}

/** Names already used directly under `parent`, lower-cased for case-insensitive filesystems. */
export function siblingNames(parent: ProjectNode): Set<string> {
	return new Set(parent.children.map((c) => c.name.toLowerCase()));
}

/** Append " 2", " 3", ... until the name is unique among `taken` (case-insensitive). */
export function uniqueName(name: string, taken: Set<string>): string {
	if (!taken.has(name.toLowerCase())) return name;
	for (let i = 2; ; i++) {
		const candidate = `${name} ${i}`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
}
