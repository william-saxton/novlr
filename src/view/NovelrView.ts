import { ItemView, Menu, Notice, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import type NovelrPlugin from "../main";
import { NewProjectModal } from "../modals/NewProjectModal";
import { join } from "../model/paths";
import type { Project, ProjectNode, UnknownEntry } from "../model/types";
import App from "./App.svelte";
import { CALLBACKS_KEY, type ViewCallbacks } from "./context";

export const VIEW_TYPE_NOVELR = "novelr";

export class NovelrView extends ItemView {
	private component: Record<string, unknown> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: NovelrPlugin,
	) {
		super(leaf);
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

	private vaultPath(project: Project, node: ProjectNode): string {
		return join(project.rootFolder, node.path);
	}

	private callbacks(): ViewCallbacks {
		const notYet = (): void => {
			new Notice("Not available yet.");
		};
		return {
			openNode: (project, node) => {
				const file = this.app.vault.getFileByPath(this.vaultPath(project, node));
				if (!file) {
					new Notice(`${node.name} was not found on disk.`);
					return;
				}
				void this.app.workspace.getLeaf(false).openFile(file);
			},
			openIndex: (project) => {
				const file = this.app.vault.getFileByPath(project.indexPath);
				if (file) void this.app.workspace.getLeaf(false).openFile(file);
			},
			newProject: () => {
				new NewProjectModal(this.app, this.plugin).open();
			},
			newNode: notYet,
			renameNode: notYet,
			deleteNode: notYet,
			moveNode: notYet,
			showNodeMenu: (project, node, event) => this.showNodeMenu(project, node, event),
			addUnknown: (_project: Project, _entry: UnknownEntry) => notYet(),
			ignoreUnknown: (_project: Project, _entry: UnknownEntry) => notYet(),
			removeMissing: notYet,
		};
	}

	private showNodeMenu(project: Project, node: ProjectNode, event: MouseEvent): void {
		const menu = new Menu();
		const file = this.app.vault.getAbstractFileByPath(this.vaultPath(project, node));
		if (node.kind === "content" && file) {
			menu.addItem((item) =>
				item
					.setTitle("Open")
					.setIcon("file-text")
					.onClick(() => {
						this.callbacks().openNode(project, node);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in new tab")
					.setIcon("file-plus")
					.onClick(() => {
						void this.app.workspace.getLeaf("tab").openFile(file as never);
					}),
			);
		}
		if (file) {
			menu.addSeparator();
			this.app.workspace.trigger("file-menu", menu, file, "novelr");
		}
		menu.showAtMouseEvent(event);
	}
}
