import { typeById } from "../../model/schema";
import type { Project, ProjectNode } from "../../model/types";
import { collapseKey } from "../../store/ui";

export interface Row {
	node: ProjectNode;
	parentPath: string;
	depth: number;
	hasChildren: boolean;
	collapsed: boolean;
	missing: boolean;
	/** Type not found in the schema. */
	unknownType: boolean;
	icon: string | undefined;
}

/** Turn the tree (excluding the root) into the visible rows, honoring collapsed containers. */
export function flatten(project: Project, collapsed: Set<string>): Row[] {
	const rows: Row[] = [];
	const missing = new Set(project.missing);
	const visit = (node: ProjectNode, depth: number, parentPath: string): void => {
		const def = typeById(project.schema, node.typeId);
		const isCollapsed = node.kind === "container" && collapsed.has(collapseKey(project.indexPath, node.path));
		rows.push({
			node,
			parentPath,
			depth,
			hasChildren: node.children.length > 0,
			collapsed: isCollapsed,
			missing: missing.has(node.path),
			unknownType: def === undefined,
			icon: def?.icon ?? (node.kind === "container" ? "folder" : "file-text"),
		});
		if (!isCollapsed) for (const child of node.children) visit(child, depth + 1, node.path);
	};
	for (const child of project.root.children) visit(child, 0, "");
	return rows;
}
