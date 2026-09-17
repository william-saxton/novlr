import type { Ancestor, CompileNode } from "./types";

/** Fill `numbering` on every node of the tree in document order. */
export function computeNumbering(root: CompileNode): void {
	const absolute = new Map<string, number>();
	const next = (typeId: string): number => {
		const n = (absolute.get(typeId) ?? 0) + 1;
		absolute.set(typeId, n);
		return n;
	};

	root.numbering = { index: 0, number: 1, count: 1, absolute: next(root.typeId), depth: 0, ancestors: [] };

	const visit = (node: CompileNode, ancestors: Ancestor[]): void => {
		const perType = new Map<string, number>();
		const totals = new Map<string, number>();
		for (const child of node.children) totals.set(child.typeId, (totals.get(child.typeId) ?? 0) + 1);
		const self: Ancestor = { typeId: node.typeId, title: node.title, number: node.numbering.number, absolute: node.numbering.absolute };
		const chain = [...ancestors, self];
		node.children.forEach((child, index) => {
			const number = (perType.get(child.typeId) ?? 0) + 1;
			perType.set(child.typeId, number);
			child.numbering = {
				index,
				number,
				count: totals.get(child.typeId) ?? 1,
				absolute: next(child.typeId),
				depth: chain.length,
				ancestors: chain,
			};
			visit(child, chain);
		});
	};
	visit(root, []);
}

/** Pre-order list of all nodes. */
export function flattenNodes(root: CompileNode): CompileNode[] {
	const out: CompileNode[] = [];
	const visit = (n: CompileNode): void => {
		out.push(n);
		for (const c of n.children) visit(c);
	};
	visit(root);
	return out;
}
