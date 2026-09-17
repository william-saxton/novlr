import { str } from "../options";
import type { CompileContext, CompileNode, CompileStep } from "../types";

/** Render a node: decorations before, body (text or joined children), decorations after. */
export function renderNode(node: CompileNode, joiner: string): string {
	const body =
		node.kind === "content"
			? node.text
			: node.children
					.map((c) => renderNode(c, joiner))
					.filter((s) => s.length > 0)
					.join(joiner);
	const parts = [...node.before, body, ...node.after].filter((s) => s.length > 0);
	return parts.join(joiner);
}

export const JoinTreeStep: CompileStep = {
	description: {
		canonicalID: "join-tree",
		name: "Build manuscript",
		description: "Flattens the structure into a single text, in order, including any inserted text.",
		kind: "join",
		external: false,
		options: [
			{ id: "joiner", name: "Separator", description: "Placed between consecutive pieces of text. Default is one blank line.", type: "text", default: "\\n\\n" },
		],
	},
	compile(root: CompileNode, ctx: CompileContext) {
		const joiner = str(ctx.options["joiner"], "\\n\\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
		return renderNode(root, joiner);
	},
};
