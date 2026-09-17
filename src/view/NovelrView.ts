import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import type NovelrPlugin from "../main";
import App from "./App.svelte";

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
			props: { pluginVersion: this.plugin.manifest.version },
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
}
