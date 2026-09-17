import { ItemView, Menu, Notice, Scope, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { get } from "svelte/store";
import type NovelrPlugin from "../main";
import { confirm } from "../modals/ConfirmModal";
import { IconSuggest } from "../modals/IconSuggest";
import { promptNewNode } from "../modals/NewNodeModal";
import { NewProjectModal } from "../modals/NewProjectModal";
import { promptText } from "../modals/TextPromptModal";
import { dirname, join, validateName } from "../model/paths";
import { BUILTIN_PRESETS, allowedChildTypes, typeById } from "../model/schema";
import { findByPath, parentOf } from "../model/tree";
import type { Project, ProjectNode, UnknownEntry } from "../model/types";
import { projects } from "../store/projects";
import { setCollapsed } from "../store/ui";
import {
	createWorkflow,
	deleteWorkflow,
	findWorkflow,
	presets,
	renameWorkflow,
	savePreset,
	touchWorkflow,
	workflows,
} from "../store/workflows";
import App from "./App.svelte";
import { CALLBACKS_KEY, type ViewCallbacks } from "./context";

export const VIEW_TYPE_NOVELR = "novelr";
const UNDO_DEPTH = 30;

interface UndoEntry {
	indexPath: string;
	root: ProjectNode;
}

export class NovelrView extends ItemView {
	private component: Record<string, unknown> | null = null;
	private readonly undoStack: UndoEntry[] = [];
	private readonly redoStack: UndoEntry[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: NovelrPlugin,
	) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", () => {
			this.undo();
			return false;
		});
		this.scope.register(["Mod", "Shift"], "z", () => {
			this.redo();
			return false;
		});
	}

	override getViewType(): string {
		return VIEW_TYPE_NOVELR;
	}

	override getDisplayText(): string {
		return "Novelr";
	}

	override getIcon(): string {
		return "book-open";
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass("novelr-view");
		this.component = mount(App, {
			target: this.contentEl,
			context: new Map<symbol, ViewCallbacks>([[CALLBACKS_KEY, this.callbacks()]]),
		});
		await Promise.resolve();
	}

	override async onClose(): Promise<void> {
		if (this.component) {
			await unmount(this.component);
			this.component = null;
		}
		this.contentEl.empty();
	}

	// ---- helpers ------------------------------------------------------------

	private get ops() {
		return this.plugin.ops;
	}

	private vaultPath(project: Project, node: ProjectNode): string {
		return join(project.rootFolder, node.path);
	}

	private live(project: Project): Project | undefined {
		return get(projects).get(project.indexPath);
	}

	/** Record the tree before an index-only change so Mod+Z can restore it. */
	private remember(project: Project): void {
		this.undoStack.push({ indexPath: project.indexPath, root: this.ops.snapshot(project) });
		if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
		this.redoStack.length = 0;
	}

	private undo(): void {
		const entry = this.undoStack.pop();
		if (!entry) return;
		const project = get(projects).get(entry.indexPath);
		if (!project) return;
		this.redoStack.push({ indexPath: entry.indexPath, root: this.ops.snapshot(project) });
		this.ops.restore(project, entry.root);
	}

	private redo(): void {
		const entry = this.redoStack.pop();
		if (!entry) return;
		const project = get(projects).get(entry.indexPath);
		if (!project) return;
		this.undoStack.push({ indexPath: entry.indexPath, root: this.ops.snapshot(project) });
		this.ops.restore(project, entry.root);
	}

	// ---- callbacks ----------------------------------------------------------

	private callbacks(): ViewCallbacks {
		return {
			openNode: (project, node) => this.openNode(project, node),
			openIndex: (project) => {
				const file = this.app.vault.getFileByPath(project.indexPath);
				if (file) void this.app.workspace.getLeaf(false).openFile(file);
			},
			newProject: () => {
				new NewProjectModal(this.app, this.plugin).open();
			},
			newNode: (project, parent) => void this.newNode(project, parent),
			renameNode: (project, node) => void this.renameNode(project, node),
			deleteNode: (project, node) => void this.deleteNode(project, node),
			moveNode: (project, nodePath, newParentPath, index) => {
				const current = this.live(project) ?? project;
				if (dirname(nodePath) === newParentPath) this.remember(current);
				void this.ops.moveNode(current, nodePath, newParentPath, index);
			},
			showNodeMenu: (project, node, event) => this.showNodeMenu(project, node, event),
			addUnknown: (project, entry) => this.addUnknown(project, entry),
			ignoreUnknown: (project, entry) => {
				const current = this.live(project) ?? project;
				this.remember(current);
				this.ops.ignoreUnknown(current, entry);
			},
			removeMissing: (project, path) => {
				const current = this.live(project) ?? project;
				this.remember(current);
				this.ops.removeMissing(current, path);
			},
			openPath: (path) => {
				const file = this.app.vault.getFileByPath(path);
				if (file) void this.app.workspace.getLeaf(false).openFile(file);
				else new Notice(`${path} was not found.`);
			},
			attachIconSuggest: (input, onPick) => {
				new IconSuggest(this.app, input, onPick);
			},
			showStatusMenu: (project, node, event) => {
				const current = this.live(project) ?? project;
				const menu = new Menu();
				this.addStatusItems(menu, current, node);
				menu.showAtMouseEvent(event);
			},
			setStatuses: (project, statuses, renames) => {
				const current = this.live(project) ?? project;
				const errors = this.ops.setStatuses(current, statuses, renames);
				if (errors.length === 0) new Notice("Statuses updated.");
				return errors;
			},
			// Project
			setTitle: (project, title) => this.ops.setTitle(this.live(project) ?? project, title),
			setIgnore: (project, patterns) => this.ops.setIgnore(this.live(project) ?? project, patterns),
			setSchema: (project, schema, renames) => {
				const current = this.live(project) ?? project;
				const errors = this.ops.setSchema(current, schema, renames);
				if (errors.length === 0) new Notice("Schema updated.");
				return errors;
			},
			listPresets: () => [...BUILTIN_PRESETS, ...get(presets)],
			savePreset: (project) => void this.savePreset(this.live(project) ?? project),
			loadPreset: (project, preset) => {
				const current = this.live(project) ?? project;
				const errors = this.ops.loadPreset(current, preset);
				if (errors.length > 0) new Notice(errors[0] ?? "Could not load the preset.");
				else new Notice(`Loaded preset ${preset.name}.`);
			},
			removeProject: (project) => void this.removeProject(this.live(project) ?? project),
			// Compile
			setWorkflow: (project, name) => this.ops.setWorkflow(this.live(project) ?? project, name),
			validateWorkflow: (project, workflow) => this.plugin.compiler.validate(project, workflow),
			compile: async (project, name, onProgress) => {
				const current = this.live(project) ?? project;
				const workflow = findWorkflow(name);
				if (!workflow) return { ok: false, log: [], error: `Workflow "${name}" does not exist.`, outputs: {} };
				return this.plugin.compiler.compile(current, workflow, onProgress);
			},
			listStepDescriptions: () => this.plugin.compiler.registry.all().map((s) => s.description),
			stepDescription: (id) => this.plugin.compiler.registry.get(id)?.description,
			newWorkflow: (project) => {
				const created = createWorkflow();
				this.ops.setWorkflow(this.live(project) ?? project, created.name);
			},
			duplicateWorkflow: (project, name) => {
				const base = findWorkflow(name);
				if (!base) return;
				const created = createWorkflow(base);
				this.ops.setWorkflow(this.live(project) ?? project, created.name);
			},
			renameWorkflow: (project, name) => void this.renameWorkflow(this.live(project) ?? project, name),
			deleteWorkflow: (project, name) => void this.deleteWorkflow(this.live(project) ?? project, name),
			workflowChanged: () => touchWorkflow(),
		};
	}

	private async savePreset(project: Project): Promise<void> {
		const name = await promptText(this.app, {
			title: "Save schema as preset",
			label: "Preset name",
			initial: project.title,
			submitText: "Save",
			validate: (v) => (v.trim().length === 0 ? "Enter a name." : BUILTIN_PRESETS.some((p) => p.name === v.trim()) ? "That name belongs to a built-in preset." : null),
		});
		if (!name) return;
		savePreset(name.trim(), project.schema);
		new Notice(`Saved preset ${name.trim()}.`);
	}

	private async removeProject(project: Project): Promise<void> {
		const ok = await confirm(this.app, {
			title: `Remove ${project.title}?`,
			message: "The novelr property is deleted from the index note. Your folders and notes stay exactly where they are.",
			confirmText: "Remove",
			danger: true,
		});
		if (!ok) return;
		await this.ops.removeProject(project);
	}

	private async renameWorkflow(project: Project, name: string): Promise<void> {
		const next = await promptText(this.app, {
			title: "Rename workflow",
			initial: name,
			submitText: "Rename",
			validate: (v) => (v.trim().length === 0 ? "Enter a name." : get(workflows).some((w) => w.name === v.trim() && w.name !== name) ? "A workflow with that name exists." : null),
		});
		if (!next || next.trim() === name) return;
		if (renameWorkflow(name, next.trim())) {
			// Every project referencing the old name follows it.
			for (const p of get(projects).values()) if (p.workflow === name) this.ops.setWorkflow(p, next.trim());
			if (project.workflow !== name) this.ops.setWorkflow(project, next.trim());
		}
	}

	private async deleteWorkflow(project: Project, name: string): Promise<void> {
		const ok = await confirm(this.app, {
			title: `Delete workflow ${name}?`,
			message: "Projects using it fall back to the first remaining workflow.",
			confirmText: "Delete",
			danger: true,
		});
		if (!ok) return;
		deleteWorkflow(name);
		for (const p of get(projects).values()) if (p.workflow === name) this.ops.setWorkflow(p, null);
		if (project.workflow === name) this.ops.setWorkflow(project, null);
	}

	private openNode(project: Project, node: ProjectNode): void {
		const file = this.app.vault.getFileByPath(this.vaultPath(project, node));
		if (!file) {
			new Notice(`${node.name} was not found on disk.`);
			return;
		}
		void this.app.workspace.getLeaf(false).openFile(file);
	}

	/** Used by the "New node in current container" command. */
	promptNewNode(project: Project, parent: ProjectNode): Promise<void> {
		return this.newNode(project, parent);
	}

	private async newNode(project: Project, parent: ProjectNode, preferredTypeId?: string, index?: number): Promise<void> {
		const current = this.live(project) ?? project;
		const liveParent = findByPath(current.root, parent.path) ?? current.root;
		if (allowedChildTypes(current.schema, liveParent.typeId).length === 0) {
			new Notice(`${typeById(current.schema, liveParent.typeId)?.name ?? liveParent.typeId} cannot hold any node types.`);
			return;
		}
		const result = await promptNewNode(this.app, current, liveParent, preferredTypeId);
		if (!result) return;
		const node = await this.ops.createNode(current, liveParent.path, result.typeId, result.name, index);
		if (!node) return;
		setCollapsed(current.indexPath, liveParent.path, false);
		if (node.kind === "content") this.openNode(current, node);
	}

	private async renameNode(project: Project, node: ProjectNode): Promise<void> {
		const current = this.live(project) ?? project;
		const name = await promptText(this.app, {
			title: `Rename ${node.name}`,
			initial: node.name,
			submitText: "Rename",
			validate: (v) => validateName(v.trim()),
		});
		if (name === null) return;
		await this.ops.renameNode(current, node, name);
	}

	private async deleteNode(project: Project, node: ProjectNode): Promise<void> {
		const current = this.live(project) ?? project;
		if (this.plugin.settings.confirmDelete) {
			const count = node.children.length;
			const detail = node.kind === "container" && count > 0 ? ` and the ${count} node${count === 1 ? "" : "s"} inside it` : "";
			const ok = await confirm(this.app, {
				title: `Delete ${node.name}?`,
				message: `${node.name}${detail} will be moved to the trash and removed from the index.`,
				confirmText: "Delete",
				danger: true,
			});
			if (!ok) return;
		}
		await this.ops.deleteNode(current, node);
	}

	private addUnknown(project: Project, entry: UnknownEntry): void {
		const current = this.live(project) ?? project;
		const parent = findByPath(current.root, dirname(entry.path));
		if (!parent) {
			new Notice("The containing folder is not part of the structure yet.");
			return;
		}
		const wantKind = entry.isFolder ? "container" : "content";
		const options = allowedChildTypes(current.schema, parent.typeId).filter((t) => t.kind === wantKind);
		if (options.length === 0) {
			new Notice(`No ${wantKind} type is allowed inside ${parent.typeId}.`);
			return;
		}
		const suggested = this.ops.suggestType(current, entry, parent.typeId);
		if (options.length === 1) {
			this.remember(current);
			this.ops.addUnknown(current, entry, options[0]?.id);
			return;
		}
		const menu = new Menu();
		for (const t of options) {
			menu.addItem((item) =>
				item
					.setTitle(`Add as ${t.name.toLowerCase()}`)
					.setIcon(t.icon ?? "plus")
					.setChecked(t.id === suggested)
					.onClick(() => {
						this.remember(current);
						this.ops.addUnknown(current, entry, t.id);
					}),
			);
		}
		menu.showAtPosition({ x: this.contentEl.getBoundingClientRect().left + 40, y: this.contentEl.getBoundingClientRect().top + 80 });
	}

	/** One item per status plus "No status"; the current explicit status is checked. */
	private addStatusItems(menu: Menu, project: Project, node: ProjectNode): void {
		const live = findByPath(project.root, node.path) ?? node;
		for (const s of project.statuses) {
			menu.addItem((item) =>
				item
					.setTitle(s.name)
					.setIcon(s.color ? "circle" : "circle-dashed")
					.setChecked(live.status === s.id)
					.onClick(() => void this.ops.setStatus(project, live, s.id)),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("No status")
				.setIcon("circle-off")
				.setChecked(live.status === undefined)
				.onClick(() => void this.ops.setStatus(project, live, null)),
		);
	}

	private showNodeMenu(project: Project, node: ProjectNode, event: MouseEvent): void {
		const current = this.live(project) ?? project;
		const menu = new Menu();
		const file = this.app.vault.getAbstractFileByPath(this.vaultPath(current, node));
		const parent = parentOf(current.root, node.path);
		const def = typeById(current.schema, node.typeId);

		if (node.kind === "content" && file) {
			menu.addItem((item) =>
				item
					.setTitle("Open in new tab")
					.setIcon("file-plus")
					.onClick(() => {
						void this.app.workspace.getLeaf("tab").openFile(file as never);
					}),
			);
		}
		if (node.kind === "container") {
			for (const t of allowedChildTypes(current.schema, node.typeId)) {
				menu.addItem((item) =>
					item
						.setTitle(`New ${t.name.toLowerCase()} inside`)
						.setIcon(t.icon ?? "plus")
						.onClick(() => void this.newNode(current, node, t.id)),
				);
			}
		}
		if (parent) {
			const index = parent.children.findIndex((c) => c.path === node.path) + 1;
			for (const t of allowedChildTypes(current.schema, parent.typeId)) {
				menu.addItem((item) =>
					item
						.setTitle(`New ${t.name.toLowerCase()} after`)
						.setIcon(t.icon ?? "plus")
						.onClick(() => void this.newNode(current, parent, t.id, index)),
				);
			}
		}
		menu.addSeparator();
		if (current.statuses.length > 0) {
			menu.addItem((item) =>
				item
					.setTitle("Set status…")
					.setIcon("circle-dot")
					.onClick(() => {
						const statusMenu = new Menu();
						this.addStatusItems(statusMenu, current, node);
						statusMenu.showAtMouseEvent(event);
					}),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("Rename")
				.setIcon("pencil")
				.onClick(() => void this.renameNode(current, node)),
		);
		if (parent) {
			const alternatives = allowedChildTypes(current.schema, parent.typeId).filter((t) => t.kind === node.kind && t.id !== node.typeId);
			for (const t of alternatives) {
				menu.addItem((item) =>
					item
						.setTitle(`Change type to ${t.name.toLowerCase()}`)
						.setIcon("tag")
						.onClick(() => {
							this.remember(current);
							void this.ops.changeType(current, node, t.id);
						}),
				);
			}
		}
		menu.addItem((item) =>
			item
				.setTitle("Delete")
				.setIcon("trash")
				.setWarning(true)
				.onClick(() => void this.deleteNode(current, node)),
		);
		if (file) {
			menu.addSeparator();
			this.app.workspace.trigger("file-menu", menu, file, "novelr");
		}
		if (def === undefined) {
			menu.addSeparator();
			menu.addItem((item) => item.setTitle(`Unknown type "${node.typeId}"`).setIsLabel(true));
		}
		menu.showAtMouseEvent(event);
	}
}
