import { TYPE_ID_PATTERN } from "./schema";
import type { ProjectNode, StatusDef } from "./types";

export const STATUS_COLORS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

export const DEFAULT_STATUSES: StatusDef[] = [
	{ id: "new", name: "New", color: "blue", parent: "in-progress", default: true },
	{ id: "in-progress", name: "In progress", color: "yellow", parent: "in-progress" },
	{ id: "done", name: "Done", color: "green" },
];

export function cloneStatuses(statuses: StatusDef[]): StatusDef[] {
	return statuses.map((s) => ({ ...s }));
}

export function statusById(statuses: StatusDef[], id: string | undefined): StatusDef | undefined {
	return id === undefined ? undefined : statuses.find((s) => s.id === id);
}

export function defaultStatusId(statuses: StatusDef[]): string | undefined {
	return statuses.find((s) => s.default)?.id;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A status color is either one of the named accent colors or a hex color such as #ff8800. */
export function isStatusColor(v: unknown): v is string {
	return typeof v === "string" && ((STATUS_COLORS as readonly string[]).includes(v) || HEX_COLOR.test(v));
}

/** CSS value for a status color: theme variable for named colors, the hex itself otherwise. */
export function statusColorValue(color: string | undefined): string {
	if (!color) return "var(--text-faint)";
	if ((STATUS_COLORS as readonly string[]).includes(color)) return `var(--color-${color})`;
	return HEX_COLOR.test(color) ? color : "var(--text-faint)";
}

/** Returns problems; empty means valid. */
export function validateStatuses(statuses: StatusDef[]): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	let defaults = 0;
	for (const s of statuses) {
		if (!TYPE_ID_PATTERN.test(s.id)) errors.push(`Status id "${s.id}" must match ${TYPE_ID_PATTERN.source}.`);
		if (ids.has(s.id)) errors.push(`Duplicate status id "${s.id}".`);
		ids.add(s.id);
		if (s.name.trim().length === 0) errors.push(`Status "${s.id}" needs a name.`);
		if (s.color !== undefined && !isStatusColor(s.color)) errors.push(`Status "${s.id}" has an unknown color.`);
		if (s.default) defaults++;
	}
	for (const s of statuses) {
		if (s.parent !== undefined && !ids.has(s.parent)) errors.push(`Status "${s.id}" pushes unknown status "${s.parent}" to its parent.`);
	}
	if (defaults > 1) errors.push("Only one status can be the default for new nodes.");
	return errors;
}

export interface EffectiveStatus {
	/** The status stored on the node, if any. */
	explicit: string | undefined;
	/** What the node shows: pushed up from children, else the explicit status. */
	effective: string | undefined;
	/** True when children overrode the explicit status. */
	fromChildren: boolean;
}

/**
 * Compute effective statuses bottom-up. A child's effective status pushes its `parent`
 * status onto the container; when children push different statuses, the one listed
 * first in `statuses` wins.
 */
export function computeEffectiveStatuses(root: ProjectNode, statuses: StatusDef[]): Map<string, EffectiveStatus> {
	const byId = new Map(statuses.map((s) => [s.id, s]));
	const rank = new Map(statuses.map((s, i) => [s.id, i]));
	const out = new Map<string, EffectiveStatus>();

	const visit = (node: ProjectNode): string | undefined => {
		let pushed: string | undefined;
		let pushedRank = Number.POSITIVE_INFINITY;
		for (const child of node.children) {
			const childEffective = visit(child);
			const parent = byId.get(childEffective ?? "")?.parent;
			if (parent === undefined || !byId.has(parent)) continue;
			const r = rank.get(parent) ?? Number.POSITIVE_INFINITY;
			if (r < pushedRank) {
				pushedRank = r;
				pushed = parent;
			}
		}
		const explicit = node.status;
		const effective = pushed ?? explicit;
		out.set(node.path, { explicit, effective, fromChildren: pushed !== undefined && pushed !== explicit });
		return effective;
	};
	visit(root);
	return out;
}
