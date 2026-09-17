import { getContext } from "svelte";
import type { ProgressCallback, RunResult, StepDescription, ValidationResult, Workflow } from "../compile/types";
import type { Project, ProjectNode, Schema, SchemaPreset, StatusDef, UnknownEntry } from "../model/types";

export interface MenuItemSpec {
	title: string;
	icon?: string;
	danger?: boolean;
	onClick: () => void;
}

/**
 * Imperative operations the Svelte tree needs but must not perform itself.
 * Implemented by NovelrView so components never import `obsidian`.
 */
export interface ViewCallbacks {
	openNode(project: Project, node: ProjectNode): void;
	openIndex(project: Project): void;
	openPath(path: string): void;
	newProject(): void;
	newNode(project: Project, parent: ProjectNode): void;
	renameNode(project: Project, node: ProjectNode): void;
	deleteNode(project: Project, node: ProjectNode): void;
	moveNode(project: Project, nodePath: string, newParentPath: string, index: number): void;
	showNodeMenu(project: Project, node: ProjectNode, event: MouseEvent): void;
	addUnknown(project: Project, entry: UnknownEntry): void;
	ignoreUnknown(project: Project, entry: UnknownEntry): void;
	removeMissing(project: Project, path: string): void;
	showStatusMenu(project: Project, node: ProjectNode, event: MouseEvent): void;
	/** Attach an icon-id autocomplete to a text input. */
	attachIconSuggest(input: HTMLInputElement, onPick: (id: string) => void): void;
	/** Show a native context menu at the mouse position. */
	showMenu(event: MouseEvent, items: MenuItemSpec[]): void;
	/** Returns validation errors; applies when empty. */
	setStatuses(project: Project, statuses: StatusDef[], renames: Record<string, string>): string[];
	// Project
	setTitle(project: Project, title: string): void;
	setIgnore(project: Project, patterns: string[]): void;
	/** Returns validation errors; applies when empty. */
	setSchema(project: Project, schema: Schema, renames: Record<string, string>): string[];
	listPresets(): SchemaPreset[];
	savePreset(project: Project): void;
	loadPreset(project: Project, preset: SchemaPreset): void;
	removeProject(project: Project): void;
	// Compile
	setWorkflow(project: Project, name: string | null): void;
	validateWorkflow(project: Project, workflow: Workflow): ValidationResult;
	compile(project: Project, name: string, onProgress?: ProgressCallback): Promise<RunResult>;
	listStepDescriptions(): StepDescription[];
	stepDescription(id: string): StepDescription | undefined;
	newWorkflow(project: Project): void;
	duplicateWorkflow(project: Project, name: string): void;
	renameWorkflow(project: Project, name: string): void;
	deleteWorkflow(project: Project, name: string): void;
	workflowChanged(): void;
}

export const CALLBACKS_KEY = Symbol("novelr-callbacks");

export function getCallbacks(): ViewCallbacks {
	return getContext<ViewCallbacks>(CALLBACKS_KEY);
}
