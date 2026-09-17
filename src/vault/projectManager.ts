import { type CachedMetadata, TAbstractFile, TFile, TFolder } from "obsidian";
import { get } from "svelte/store";
import type NovelrPlugin from "../main";
import { relativeTo } from "../model/paths";
import { FRONTMATTER_KEY, NODE_TYPE_KEY, STATUS_KEY, parseProject, serializeProject } from "../model/serialize";
import type { Project, ProjectFrontmatter } from "../model/types";
import { projectContaining, projects, removeProject, selectedIndexPath, setProject, updateProject } from "../store/projects";
import { activeFilePath } from "../store/ui";
import { debounce, type Debounced } from "../utils/debounce";
import { deepEqual } from "../utils/deepEqual";
import { applyRename } from "./applyRename";
import { reconcile, type DiskEntry } from "./reconcile";

const PERSIST_DELAY_MS = 250;

/**
 * Owns discovery of projects, keeps the store in sync with the vault, and writes
 * tree changes back to index notes.
 */
export class ProjectManager {
	/** Last frontmatter we parsed from or wrote to each index note, in normalized form. */
	private readonly lastKnown = new Map<string, ProjectFrontmatter>();
	/** Serializes writes per index note so processFrontMatter calls never interleave. */
	private readonly writeQueue = new Map<string, Promise<void>>();
	private readonly persistTimers = new Map<string, Debounced<[]>>();

	constructor(private readonly plugin: NovelrPlugin) {}

	/** Call from `workspace.onLayoutReady`. */
	start(): void {
		const { app } = this.plugin;
		const found = new Map<string, Project>();
		for (const file of app.vault.getMarkdownFiles()) {
			const raw: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[FRONTMATTER_KEY];
			if (raw === undefined) continue;
			const project = this.load(file.path, raw);
			if (project) found.set(file.path, project);
		}
		projects.set(found);
		this.selectInitial();

		this.plugin.registerEvent(app.metadataCache.on("changed", (file, _data, cache) => this.onMetadataChanged(file, cache)));
		this.plugin.registerEvent(app.vault.on("create", (file) => this.onCreate(file)));
		this.plugin.registerEvent(app.vault.on("delete", (file) => this.onDelete(file)));
		this.plugin.registerEvent(app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		this.plugin.registerEvent(app.workspace.on("file-open", (file) => this.onFileOpen(file)));
		this.onFileOpen(app.workspace.getActiveFile());
	}

	// ---- loading -------------------------------------------------------------

	private load(indexPath: string, raw: unknown): Project | null {
		const { project } = parseProject(indexPath, raw);
		if (!project) return null;
		this.lastKnown.set(indexPath, serializeProject(project));
		this.refreshDiskState(project);
		return project;
	}

	private selectInitial(): void {
		if (get(selectedIndexPath)) return;
		const active = this.plugin.app.workspace.getActiveFile();
		const byActive = active ? projectContaining(active.path) : undefined;
		const first = byActive ?? [...get(projects).values()][0];
		if (first) selectedIndexPath.set(first.indexPath);
	}

	// ---- disk listing and reconcile -----------------------------------------

	private listDisk(project: Project): DiskEntry[] {
		const { vault, metadataCache } = this.plugin.app;
		const folder = project.rootFolder === "" ? vault.getRoot() : vault.getFolderByPath(project.rootFolder);
		if (!folder) return [];
		const entries: DiskEntry[] = [];
		const visit = (f: TFolder): void => {
			for (const child of f.children) {
				const rel = relativeTo(project.rootFolder, child.path);
				if (rel === null || rel === "") continue;
				if (child instanceof TFolder) {
					entries.push({ path: rel, isFolder: true });
					visit(child);
				} else if (child instanceof TFile && child.extension === "md") {
					const fm = metadataCache.getFileCache(child)?.frontmatter;
					const guessed: unknown = fm?.[NODE_TYPE_KEY];
					const guessedStatus: unknown = fm?.[STATUS_KEY];
					entries.push({
						path: rel,
						isFolder: false,
						...(typeof guessed === "string" ? { guessedType: guessed } : {}),
						...(typeof guessedStatus === "string" ? { guessedStatus } : {}),
					});
				}
			}
		};
		visit(folder);
		return entries;
	}

	/** Recompute `unknown` and `missing` for a project in place. */
	refreshDiskState(project: Project): void {
		const indexRel = relativeTo(project.rootFolder, project.indexPath) ?? project.indexPath;
		const { unknown, missing } = reconcile(project.root, this.listDisk(project), project.ignore, indexRel);
		project.unknown = unknown;
		project.missing = missing;
	}

	private refreshProjectsContaining(path: string): void {
		for (const project of get(projects).values()) {
			const rel = relativeTo(project.rootFolder, path);
			if (rel === null) continue;
			updateProject(project.indexPath, (p) => this.refreshDiskState(p));
		}
	}

	// ---- vault events -------------------------------------------------------

	private onMetadataChanged(file: TFile, cache: CachedMetadata): void {
		const raw: unknown = cache.frontmatter?.[FRONTMATTER_KEY];
		const existing = get(projects).get(file.path);
		if (raw === undefined) {
			if (existing) {
				this.lastKnown.delete(file.path);
				removeProject(file.path);
			}
			return;
		}
		const { project } = parseProject(file.path, raw);
		if (!project) return;
		const normalized = serializeProject(project);
		if (existing && deepEqual(normalized, this.lastKnown.get(file.path))) return;
		this.lastKnown.set(file.path, normalized);
		this.refreshDiskState(project);
		setProject(project);
		if (!get(selectedIndexPath)) selectedIndexPath.set(file.path);
	}

	private onCreate(file: TAbstractFile): void {
		this.refreshProjectsContaining(file.path);
	}

	private onDelete(file: TAbstractFile): void {
		if (get(projects).has(file.path)) {
			this.lastKnown.delete(file.path);
			removeProject(file.path);
		}
		if (file instanceof TFolder) {
			for (const p of [...get(projects).values()]) {
				if (p.indexPath.startsWith(file.path + "/")) {
					this.lastKnown.delete(p.indexPath);
					removeProject(p.indexPath);
				}
			}
		}
		for (const project of [...get(projects).values()]) {
			const rel = relativeTo(project.rootFolder, file.path);
			if (rel === null || rel === "") continue;
			updateProject(project.indexPath, (p) => {
				if (applyRename(p, rel, null)) this.schedulePersist(p.indexPath);
				this.refreshDiskState(p);
			});
		}
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		// An index note (or a folder holding one) moved: re-key its project.
		const moved = [...get(projects).values()].filter(
			(p) => p.indexPath === oldPath || p.indexPath.startsWith(oldPath + "/"),
		);
		for (const p of moved) {
			this.lastKnown.delete(p.indexPath);
			const wasSelected = get(selectedIndexPath) === p.indexPath;
			removeProject(p.indexPath);
			const newIndexPath = p.indexPath === oldPath ? file.path : file.path + p.indexPath.slice(oldPath.length);
			const newFile = this.plugin.app.vault.getFileByPath(newIndexPath);
			const raw: unknown = newFile
				? this.plugin.app.metadataCache.getFileCache(newFile)?.frontmatter?.[FRONTMATTER_KEY]
				: undefined;
			const reloaded = raw !== undefined ? this.load(newIndexPath, raw) : null;
			if (reloaded) {
				setProject(reloaded);
				if (wasSelected) selectedIndexPath.set(newIndexPath);
			}
		}
		if (moved.length > 0) return;

		for (const project of [...get(projects).values()]) {
			const oldRel = relativeTo(project.rootFolder, oldPath);
			const newRel = relativeTo(project.rootFolder, file.path);
			if (oldRel === null && newRel === null) continue;
			updateProject(project.indexPath, (p) => {
				if (oldRel !== null && oldRel !== "" && applyRename(p, oldRel, newRel)) this.schedulePersist(p.indexPath);
				this.refreshDiskState(p);
			});
		}
	}

	private onFileOpen(file: TFile | null): void {
		activeFilePath.set(file?.path ?? null);
		if (!file) return;
		const project = projectContaining(file.path);
		if (project) selectedIndexPath.set(project.indexPath);
	}

	// ---- persistence --------------------------------------------------------

	/** Debounced write of the project's current tree to its index note. */
	schedulePersist(indexPath: string): void {
		let timer = this.persistTimers.get(indexPath);
		if (!timer) {
			timer = debounce(() => {
				const project = get(projects).get(indexPath);
				if (project) void this.persist(project);
			}, PERSIST_DELAY_MS);
			this.persistTimers.set(indexPath, timer);
		}
		timer();
	}

	/** Write immediately (still serialized per file). */
	persist(project: Project): Promise<void> {
		const fm = serializeProject(project);
		if (deepEqual(fm, this.lastKnown.get(project.indexPath))) return Promise.resolve();
		this.lastKnown.set(project.indexPath, fm);
		const file = this.plugin.app.vault.getFileByPath(project.indexPath);
		if (!file) return Promise.resolve();
		const prev = this.writeQueue.get(project.indexPath) ?? Promise.resolve();
		const next = prev
			.then(() =>
				this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
					frontmatter[FRONTMATTER_KEY] = fm;
				}),
			)
			.catch((error: unknown) => {
				console.error("Novelr: failed to write index note", project.indexPath, error);
			});
		this.writeQueue.set(project.indexPath, next);
		return next;
	}

	/** Flush pending writes (used before unload). */
	async flush(): Promise<void> {
		for (const timer of this.persistTimers.values()) timer.flush();
		await Promise.all([...this.writeQueue.values()]);
	}
}
