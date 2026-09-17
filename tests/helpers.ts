import { computeNumbering } from "../src/compile/numbering";
import type { CompileNode } from "../src/compile/types";
import type { NodeKind } from "../src/model/types";

export interface Spec {
	type: string;
	title: string;
	text?: string;
	children?: Spec[];
}

function toNode(spec: Spec, parentPath: string): CompileNode {
	const kind: NodeKind = spec.children ? "container" : "content";
	const path = parentPath ? `${parentPath}/${spec.title}${kind === "content" ? ".md" : ""}` : "";
	return {
		typeId: spec.type,
		kind,
		title: spec.title,
		path,
		frontmatter: {},
		text: spec.text ?? "",
		before: [],
		after: [],
		children: (spec.children ?? []).map((c) => toNode(c, path || spec.title)),
		numbering: { index: 0, number: 1, count: 1, absolute: 1, depth: 0, ancestors: [] },
	};
}

/** Build a numbered compile tree from a compact spec. A spec with `children` is a container. */
export function tree(spec: Spec): CompileNode {
	const root = toNode(spec, "");
	computeNumbering(root);
	return root;
}

export function novelTree(): CompileNode {
	return tree({
		type: "novel",
		title: "The Hollow Road",
		children: [
			{
				type: "chapter",
				title: "Chapter One",
				children: [
					{ type: "scene", title: "Opening", text: "# Opening\n\nFirst scene text." },
					{ type: "scene", title: "The Call", text: "# The Call\n\nSecond scene text." },
				],
			},
			{
				type: "chapter",
				title: "Chapter Two",
				children: [{ type: "scene", title: "Aftermath", text: "# Aftermath\n\nThird scene text." }],
			},
		],
	});
}
