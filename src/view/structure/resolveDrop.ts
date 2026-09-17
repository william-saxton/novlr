import { canContain } from "../../model/schema";
import type { Schema } from "../../model/types";
import type { Row } from "./flatten";

export interface DropTarget {
	/** Path of the container that will receive the node ("" = root). */
	parentPath: string;
	parentTypeId: string;
	/** Index among the parent's children after the dragged node has been removed. */
	index: number;
	/** Visual depth of the drop indicator. */
	depth: number;
	/** Position of the indicator in the trimmed row list (0..list.length). */
	listIndex: number;
}

export interface DragRows {
	/** The visible rows with the dragged node and its visible descendants removed. */
	list: Row[];
	dragged: Row;
	/** Number of rows removed (dragged row plus descendants). */
	removed: number;
}

/** Remove the dragged row and its visible descendants from the row list. */
export function trimDragged(rows: Row[], fromIndex: number): DragRows | null {
	const dragged = rows[fromIndex];
	if (!dragged) return null;
	let end = fromIndex + 1;
	while (end < rows.length && (rows[end] as Row).depth > dragged.depth) end++;
	return { list: [...rows.slice(0, fromIndex), ...rows.slice(end)], dragged, removed: end - fromIndex };
}

/**
 * Resolve where a drop between `list[listIndex - 1]` and `list[listIndex]` lands, using
 * the pointer's horizontal position (as a depth) to disambiguate nesting. Returns null when
 * no depth at that position is allowed by the schema.
 */
export function resolveDrop(
	drag: DragRows,
	listIndex: number,
	pointerDepth: number,
	schema: Schema,
	rootTypeId: string,
): DropTarget | null {
	const { list, dragged } = drag;
	const at = Math.max(0, Math.min(listIndex, list.length));
	const above = list[at - 1];
	const below = list[at];
	const maxDepth = above ? (above.node.kind === "container" ? above.depth + 1 : above.depth) : 0;
	const minDepth = below ? below.depth : 0;
	if (minDepth > maxDepth) return null;

	const wanted = Math.max(minDepth, Math.min(maxDepth, Math.round(pointerDepth)));
	// Try the wanted depth first, then alternate outward so the nearest legal depth wins.
	const candidates: number[] = [wanted];
	for (let d = 1; wanted - d >= minDepth || wanted + d <= maxDepth; d++) {
		if (wanted + d <= maxDepth) candidates.push(wanted + d);
		if (wanted - d >= minDepth) candidates.push(wanted - d);
	}

	for (const depth of candidates) {
		const target = targetAtDepth(list, at, depth, rootTypeId);
		if (!target) continue;
		if (!canContain(schema, target.parentTypeId, dragged.node.typeId)) continue;
		return { ...target, depth, listIndex: at };
	}
	return null;
}

function targetAtDepth(
	list: Row[],
	at: number,
	depth: number,
	rootTypeId: string,
): { parentPath: string; parentTypeId: string; index: number } | null {
	if (depth === 0) {
		let index = 0;
		for (let i = 0; i < at; i++) if ((list[i] as Row).depth === 0) index++;
		return { parentPath: "", parentTypeId: rootTypeId, index };
	}
	// Walk up to find the parent row (nearest row above with depth - 1).
	let parentIndex = -1;
	for (let i = at - 1; i >= 0; i--) {
		const row = list[i] as Row;
		if (row.depth === depth - 1) {
			parentIndex = i;
			break;
		}
		if (row.depth < depth - 1) return null;
	}
	if (parentIndex === -1) return null;
	const parent = list[parentIndex] as Row;
	if (parent.node.kind !== "container") return null;
	let index = 0;
	for (let i = parentIndex + 1; i < at; i++) if ((list[i] as Row).depth === depth) index++;
	return { parentPath: parent.node.path, parentTypeId: parent.node.typeId, index };
}
