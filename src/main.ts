import { type App, FuzzySuggestModal, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";
import { CompileService } from "./compile/service";
import { UserScriptLoader } from "./compile/userScripts";
import { DEFAULT_WORKFLOWS, cloneWorkflow } from "./compile/workflows";
import { NewProjectModal } from "./modals/NewProjectModal";
import { dirname, relativeTo } from "./model/paths";
import { contentNodes, findByPath } from "./model/tree";
import type { Project, ProjectNode } from "./model/types";
import { DEFAULT_SETTINGS, NovelrSettingTab, type NovelrSettings } from "./settings";
import { currentProject, projectContaining, selectedIndexPath } from "./store/projects";
import { activeTab, collapsed, revealPath } from "./store/ui";
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
	scripts: UserScriptLoader = new UserScriptLoader(this, this.compiler.registry);
	private loaded = false;

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_NOVELR, (leaf) => new NovelrView(leaf, this));

		this.addRibbonIcon("book-open", "Open structure pane", () => {
			void this.activateView();
		});

		this.registerCommands();
		this.addSettingTab(new NovelrSettingTab(this.app, this));
		this.bindStores();

		this.app.workspace.onLayoutReady(() => {
			this.projectManager.start();
			this.scripts.start();
		});
	}

	override onunload(): void {
		void this.projectManager.flush();
	}

	// ---- stores <-> settings ------------------------------------------------

	private bindStores(): void {
		workflows.set(this.settings.workflows);
		presets.set(this.settings.presets);
		collapsed.set(new Set(this.settings.collapsed));
		const persist = debounce(() => void this.saveSettings(), 500);
		this.register(
			workflows.subscribe((list) => {
				this.settings.workflows = list;
				if (this.loaded) persist();
			}),
		);
		this.register(
			presets.subscribe((list) => {
				this.settings.presets = list;
				if (this.loaded) persist();
			}),
		);
		this.register(
			collapsed.subscribe((set) => {
				this.settings.collapsed = [...set];
				if (this.loaded) persist();
			}),
		);
		this.loaded = true;
	}

	// ---- commands -----------------------------------------------------------

	private registerCommands(): void {
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

		this.addCommand({
			id: "open-index",
			name: "Open project index note",
			checkCallback: (checking) => {
				const project = this.activeProject();
				if (!project) return false;
				if (!checking) {
					const file = this.app.vault.getFileByPath(project.indexPath);
					if (file) void this.app.workspace.getLeaf(false).openFile(file);
				}
				return true;
			},
		});

		this.addCommand({
			id: "next-node",
			name: "Open next content node",
			checkCallback: (checking) => this.stepNode(1, checking),
		});

		this.addCommand({
			id: "previous-node",
			name: "Open previous content node",
			checkCallback: (checking) => this.stepNode(-1, checking),
		});

		this.addCommand({
			id: "reveal-in-structure",
			name: "Reveal active file in structure pane",
			checkCallback: (checking) => {
				const located = this.activeNode();
				if (!located) return false;
				if (!checking) void this.reveal(located.project, located.node);
				return true;
			},
		});

		this.addCommand({
			id: "set-status",
			name: "Set status of current node",
			checkCallback: (checking) => {
				const located = this.activeNode();
				if (!located) return false;
				if (!checking) new StatusSuggestModal(this.app, this, located.project, located.node).open();
				return true;
			},
		});

		this.addCommand({
			id: "new-node",
			name: "New node in current container",
			checkCallback: (checking) => {
				const project = this.activeProject();
				if (!project) return false;
				if (!checking) void this.newNodeHere(project);
				return true;
			},
		});
	}

	/** The project of the active file, else the one selected in the pane. */
	activeProject(): Project | undefined {
		const active = this.app.workspace.getActiveFile();
		return (active ? projectContaining(active.path) : undefined) ?? get(currentProject) ?? undefined;
	}

	/** The content node behind the active file, if it belongs to a project. */
	activeNode(): { project: Project; node: ProjectNode } | undefined {
		const active = this.app.workspace.getActiveFile();
		if (!active) return undefined;
		const project = projectContaining(active.path);
		if (!project) return undefined;
		const rel = relativeTo(project.rootFolder, active.path);
		if (rel === null) return undefined;
		const node = findByPath(project.root, rel);
		return node ? { project, node } : undefined;
	}

	private stepNode(delta: number, checking: boolean): boolean {
		const located = this.activeNode();
		if (!located) return false;
		const list = contentNodes(located.project.root);
		const index = list.findIndex((n) => n.path === located.node.path);
		const target = list[index + delta];
		if (!target) return false;
		if (!checking) {
			const file = this.app.vault.getFileByPath(`${located.project.rootFolder ? located.project.rootFolder + "/" : ""}${target.path}`);
			if (file) void this.app.workspace.getLeaf(false).openFile(file);
		}
		return true;
	}

	private async reveal(project: Project, node: ProjectNode): Promise<void> {
		await this.activateView();
		selectedIndexPath.set(project.indexPath);
		activeTab.set("structure");
		// Expand every ancestor so the row is visible.
		collapsed.update((set) => {
			const next = new Set(set);
			let dir = dirname(node.path);
			while (dir !== "") {
				next.delete(`${project.indexPath}::${dir}`);
				dir = dirname(dir);
			}
			return next;
		});
		revealPath.set(node.path);
	}

	private async newNodeHere(project: Project): Promise<void> {
		const located = this.activeNode();
		let parent = project.root;
		if (located) {
			const parentPath = located.node.kind === "container" ? located.node.path : dirname(located.node.path);
			parent = findByPath(project.root, parentPath) ?? project.root;
		}
		await this.activateView();
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOVELR)[0]?.view;
		if (view instanceof NovelrView) await view.promptNewNode(project, parent);
	}

	// ---- view ---------------------------------------------------------------

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

	// ---- settings -----------------------------------------------------------

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

type StatusChoice = { id: string | null; name: string };

class StatusSuggestModal extends FuzzySuggestModal<StatusChoice> {
	constructor(
		app: App,
		private readonly plugin: NovelrPlugin,
		private readonly project: Project,
		private readonly node: ProjectNode,
	) {
		super(app);
		this.setPlaceholder(`Status for ${node.name}`);
	}

	getItems(): StatusChoice[] {
		return [...this.project.statuses.map((s) => ({ id: s.id, name: s.name })), { id: null, name: "No status" }];
	}

	getItemText(item: StatusChoice): string {
		return item.name;
	}

	onChooseItem(item: StatusChoice): void {
		void this.plugin.ops.setStatus(this.project, this.node, item.id);
	}
}
