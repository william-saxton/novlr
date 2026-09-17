import { writable } from "svelte/store";

export type Tab = "structure" | "project" | "compile";

export const activeTab = writable<Tab>("structure");

/** Vault path of the file open in the active editor, if any. */
export const activeFilePath = writable<string | null>(null);

/** Collapsed containers, keyed by `${indexPath}::${nodePath}`. */
export const collapsed = writable<Set<string>>(new Set());

/** Node path the structure pane should scroll to and focus once; cleared after use. */
export const revealPath = writable<string | null>(null);

export function collapseKey(indexPath: string, nodePath: string): string {
	return `${indexPath}::${nodePath}`;
}

export function toggleCollapsed(indexPath: string, nodePath: string): void {
	collapsed.update((set) => {
		const next = new Set(set);
		const key = collapseKey(indexPath, nodePath);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		return next;
	});
}

export function setCollapsed(indexPath: string, nodePath: string, value: boolean): void {
	collapsed.update((set) => {
		const next = new Set(set);
		const key = collapseKey(indexPath, nodePath);
		if (value) next.add(key);
		else next.delete(key);
		return next;
	});
}
