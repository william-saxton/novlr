import { computeNumbering } from "../numbering";
import type { CompileContext, CompileNode, CompileStep } from "../types";

export type FilterMode = "exclude" | "include";

/**
 * Prune the tree by status. Exclude mode drops any node (and its subtree) whose status is
 * listed. Include mode keeps content nodes whose status is listed and containers that keep
 * at least one child or match themselves. Nodes without a status count as "" .
 */
export function filterByStatus(root: CompileNode, mode: FilterMode, statuses: string[]): number {
	const set = new Set(statuses);
	let removed = 0;
	const matches = (n: CompileNode): boolean => set.has(n.status?.id ?? "");
	const visit = (node: CompileNode): void => {
		const kept: CompileNode[] = [];
		for (const child of node.children) {
			if (mode === "exclude") {
				if (matches(child)) {
					removed += 1 + countNodes(child);
					continue;
				}
				visit(child);
				kept.push(child);
			} else {
				if (child.kind === "content") {
					if (matches(child)) kept.push(child);
					else removed++;
				} else {
					visit(child);
					if (child.children.length > 0 || matches(child)) kept.push(child);
					else removed++;
				}
			}
		}
		node.children = kept;
	};
	visit(root);
	return removed;
}

export function countNodes(node: CompileNode): number {
	return node.children.reduce((n, c) => n + 1 + countNodes(c), 0);
}

export const FilterStatusStep: CompileStep = {
	description: {
		canonicalID: "filter-status",
		name: "Filter by status",
		description: "Leaves out (or keeps only) nodes with certain statuses before the manuscript is built.",
		kind: "tree",
		external: false,
		options: [
			{
				id: "mode",
				name: "Mode",
				description: "Leave out matching nodes, or keep only matching content.",
				type: "select",
				default: "exclude",
				choices: [
					{ value: "exclude", label: "Leave out nodes with these statuses" },
					{ value: "include", label: "Keep only content with these statuses" },
				],
			},
			{ id: "statuses", name: "Statuses", description: "Matched against each node's effective status.", type: "statuses", default: [] },
			{ id: "renumber", name: "Renumber", description: "Recount chapter and scene numbers after filtering.", type: "boolean", default: true },
		],
	},
	compile(root: CompileNode, ctx: CompileContext) {
		const raw = ctx.options["statuses"];
		const statuses = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];
		const mode: FilterMode = ctx.options["mode"] === "include" ? "include" : "exclude";
		const removed = filterByStatus(root, mode, statuses);
		if (ctx.options["renumber"] === true) computeNumbering(root);
		ctx.log(`${removed} node${removed === 1 ? "" : "s"} left out`);
	},
};
