import { Plugin, type WorkspaceLeaf } from "obsidian";
import { NewProjectModal } from "./modals/NewProjectModal";
import { DEFAULT_SETTINGS, NovelrSettingTab, type NovelrSettings } from "./settings";
import { ProjectManager } from "./vault/projectManager";
import { NovelrView, VIEW_TYPE_NOVELR } from "./view/NovelrView";

export default class NovelrPlugin extends Plugin {
	override settings: NovelrSettings = DEFAULT_SETTINGS;
	projectManager: ProjectManager = new ProjectManager(this);

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

		this.addCommand({
			id: "new-project",
			name: "Create new project",
			callback: () => {
				new NewProjectModal(this.app, this).open();
			},
		});

		this.addSettingTab(new NovelrSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.projectManager.start();
		});
	}

	override onunload(): void {
		void this.projectManager.flush();
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
