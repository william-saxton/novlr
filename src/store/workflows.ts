import { get, writable } from "svelte/store";
import type { Workflow } from "../compile/types";
import { cloneWorkflow, uniqueWorkflowName } from "../compile/workflows";
import type { Schema, SchemaPreset } from "../model/types";
import { cloneSchema } from "../model/schema";

/** Vault-wide workflows; mirrored into plugin settings by main.ts. */
export const workflows = writable<Workflow[]>([]);

/** User-saved schema presets; mirrored into plugin settings by main.ts. */
export const presets = writable<SchemaPreset[]>([]);

function bump(): void {
	workflows.update((list) => [...list]);
}

export function findWorkflow(name: string | null | undefined): Workflow | undefined {
	if (!name) return undefined;
	return get(workflows).find((w) => w.name === name);
}

/** Notify subscribers after mutating a workflow in place. */
export function touchWorkflow(): void {
	bump();
}

export function createWorkflow(base?: Workflow): Workflow {
	const names = get(workflows).map((w) => w.name);
	const created: Workflow = base
		? { ...cloneWorkflow(base), name: uniqueWorkflowName(`${base.name} copy`, names) }
		: { name: uniqueWorkflowName("New workflow", names), description: "", steps: [] };
	workflows.update((list) => [...list, created]);
	return created;
}

export function renameWorkflow(oldName: string, newName: string): boolean {
	const trimmed = newName.trim();
	if (trimmed.length === 0) return false;
	const list = get(workflows);
	if (list.some((w) => w.name === trimmed && w.name !== oldName)) return false;
	const target = list.find((w) => w.name === oldName);
	if (!target) return false;
	target.name = trimmed;
	bump();
	return true;
}

export function deleteWorkflow(name: string): void {
	workflows.update((list) => list.filter((w) => w.name !== name));
}

export function savePreset(name: string, schema: Schema): void {
	presets.update((list) => {
		const next = list.filter((p) => p.name !== name);
		next.push({ name, schema: cloneSchema(schema) });
		return next;
	});
}

export function deletePreset(name: string): void {
	presets.update((list) => list.filter((p) => p.name !== name));
}
