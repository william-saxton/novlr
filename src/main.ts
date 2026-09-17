import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";
import { CompileService } from "./compile/service";
import { DEFAULT_WORKFLOWS, cloneWorkflow } from "./compile/workflows";
import { NewProjectModal } from "./modals/NewProjectModal";
import { DEFAULT_SETTINGS, NovelrSettingTab, type NovelrSettings } from "./settings";
import { currentProject, projectContaining } from "./store/projects";
import { presets, workflows } from "./store/workflows";
import { debounce } from "./utils/debounce";
import { NodeOps } from "./vault/ops";
import { ProjectManager } from "./vault/projectManager";
import { NovelrView, VIEW_TYPE_NOVELR } from "./view/NovelrView";

export default class NovelrPlugin extends Plugin {
	override settings: NovelrSettings = DEFAULT_SETTINGS;
	projectManager: ProjectManager = new ProjectManager(this);
	ops: NodeOps = new NodeOps(this);
	compiler: CompileService = new CompileService(this);

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

		this.addCommand({
			id: "compile",
			name: "Compile current project",
			checkCallback: (checking) => {
				const project = this.activeProject();
				if (!project) return false;
				if (!checking) void this.compiler.compileProject(project);
				return true;
			},
		});

		this.addSettingTab(new NovelrSettingTab(this.app, this));

		// Workflows and presets live in Svelte stores so the pane reacts; settings mirror them.
		workflows.set(this.settings.workflows);
		presets.set(this.settings.presets);
		const persist = debounce(() => void this.saveSettings(), 500);
		this.register(
			workflows.subscribe((list) => {
				if (list !== this.settings.workflows) {
					this.settings.workflows = list;
					persist();
				} else if (this.loaded) {
					persist();
				}
			}),
		);
		this.register(
			presets.subscribe((list) => {
				if (list !== this.settings.presets) {
					this.settings.presets = list;
					persist();
				}
			}),
		);
		this.loaded = true;

		this.app.workspace.onLayoutReady(() => {
			this.projectManager.start();
		});
	}

	private loaded = false;

	override onunload(): void {
		void this.projectManager.flush();
	}

	/** The project of the active file, else the one selected in the pane. */
	activeProject() {
		const active = this.app.workspace.getActiveFile();
		return (active ? projectContaining(active.path) : undefined) ?? get(currentProject) ?? undefined;
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
		if (!this.settings.seededDefaults) {
			const existing = new Set(this.settings.workflows.map((w) => w.name));
			for (const w of DEFAULT_WORKFLOWS) if (!existing.has(w.name)) this.settings.workflows.push(cloneWorkflow(w));
			this.settings.seededDefaults = true;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	notice(message: string): void {
		new Notice(message);
	}
}
