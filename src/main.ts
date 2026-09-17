import { Plugin, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, NovelrSettingTab, type NovelrSettings } from "./settings";
import { NovelrView, VIEW_TYPE_NOVELR } from "./view/NovelrView";

export default class NovelrPlugin extends Plugin {
	override settings: NovelrSettings = DEFAULT_SETTINGS;

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_NOVELR, (leaf) => new NovelrView(leaf, this));

		this.addRibbonIcon("book-open", "Open structure pane", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-view",
			name: "Open structure pane",
			callback: () => {
				void this.activateView();
			},
		});

		this.addSettingTab(new NovelrSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.postLayoutInit();
		});
	}

	override onunload(): void {
		// Views and events registered through this.register* are cleaned up automatically.
	}

	private postLayoutInit(): void {
		// Vault scanning and event registration live here (M1).
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_NOVELR)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_NOVELR, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<NovelrSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
