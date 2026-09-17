import { typeById } from "../../model/schema";
import { computeEffectiveStatuses, statusById } from "../../model/status";
import type { Project, ProjectNode, StatusDef } from "../../model/types";
import { collapseKey } from "../../store/ui";

export interface RowStatus {
	/** Definition of the effective status, if any. */
	effective: StatusDef | undefined;
	/** Definition of the explicit status, if any. */
	explicit: StatusDef | undefined;
	/** Explicit id when it names a status the project no longer defines. */
	unknownId: string | undefined;
	fromChildren: boolean;
}

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
	status: RowStatus;
}

/** Turn the tree (excluding the root) into the visible rows, honoring collapsed containers. */
export function flatten(project: Project, collapsed: Set<string>): Row[] {
	const rows: Row[] = [];
	const missing = new Set(project.missing);
	const statuses = computeEffectiveStatuses(project.root, project.statuses);
	const visit = (node: ProjectNode, depth: number, parentPath: string): void => {
		const def = typeById(project.schema, node.typeId);
		const isCollapsed = node.kind === "container" && collapsed.has(collapseKey(project.indexPath, node.path));
		const eff = statuses.get(node.path);
		const explicit = statusById(project.statuses, eff?.explicit);
		rows.push({
			node,
			parentPath,
			depth,
			hasChildren: node.children.length > 0,
			collapsed: isCollapsed,
			missing: missing.has(node.path),
			unknownType: def === undefined,
			icon: def?.icon ?? (node.kind === "container" ? "folder" : "file-text"),
			status: {
				effective: statusById(project.statuses, eff?.effective),
				explicit,
				unknownId: eff?.explicit !== undefined && explicit === undefined ? eff.explicit : undefined,
				fromChildren: eff?.fromChildren ?? false,
			},
		});
		if (!isCollapsed) for (const child of node.children) visit(child, depth + 1, node.path);
	};
	for (const child of project.root.children) visit(child, 0, "");
	return rows;
}

/** Tooltip text describing a row's status. */
export function describeStatus(status: RowStatus): string {
	if (status.unknownId) return `Unknown status "${status.unknownId}"`;
	if (!status.effective) return "No status";
	if (status.fromChildren) return `${status.effective.name} (from contents${status.explicit ? `; marked ${status.explicit.name}` : ""})`;
	return status.effective.name;
}
