import { type CachedMetadata, Notice, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { get } from "svelte/store";
import type NovelrPlugin from "../main";
import { isInside, join, relativeTo } from "../model/paths";
import type { Project } from "../model/types";
import { projects } from "../store/projects";
import {
	type Comment,
	type CommentStatus,
	type NewComment,
	isCommentFrontmatter,
	newCommentId,
	parseComment,
	replaceCommentBody,
	serializeComment,
} from "./model";
import { comments, removeComment, setComment } from "./store";

const AUTHOR_STORAGE_KEY = "novelr-comment-author";

/**
 * Keeps the comment store in sync with the comment folders of every project and writes
 * comment files. One markdown file per comment: creating comments on two devices never
 * conflicts, and Obsidian Sync carries markdown without any extra settings.
 */
export class CommentManager {
	/** Comment folders (vault paths) already scanned, keyed by project index path. */
	private readonly scanned = new Map<string, string>();
	private started = false;

	constructor(private readonly plugin: NovelrPlugin) {}

	private get app() {
		return this.plugin.app;
	}

	/** Call after the project manager has discovered projects. */
	start(): void {
		if (this.started) return;
		this.started = true;
		const { app } = this;
		this.plugin.register(projects.subscribe(() => this.syncFolders()));
		this.plugin.registerEvent(app.metadataCache.on("changed", (file, data, cache) => this.onMetadataChanged(file, data, cache)));
		this.plugin.registerEvent(app.vault.on("delete", (file) => this.onDelete(file)));
		this.plugin.registerEvent(app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
	}

	// ---- identity -----------------------------------------------------------

	/** Per-device author name (local storage, so syncing plugin settings never overwrites it). */
	author(): string {
		const stored: unknown = this.app.loadLocalStorage(AUTHOR_STORAGE_KEY);
		return typeof stored === "string" ? stored : "";
	}

	setAuthor(name: string): void {
		this.app.saveLocalStorage(AUTHOR_STORAGE_KEY, name.trim() || null);
	}

	// ---- lookup ---------------------------------------------------------------

	/** Vault path of a project's comments folder. */
	folderFor(project: Project): string {
		return normalizePath(join(project.rootFolder, project.commentsFolder));
	}

	/** The project whose comments folder contains `path` (deepest root wins). */
	projectForCommentPath(path: string): Project | undefined {
		let best: Project | undefined;
		for (const p of get(projects).values()) {
			const folder = this.folderFor(p);
			if (path.startsWith(folder + "/") && (!best || p.rootFolder.length > best.rootFolder.length)) best = p;
		}
		return best;
	}

	private projectByRoot(rootFolder: string): Project | undefined {
		for (const p of get(projects).values()) if (p.rootFolder === rootFolder) return p;
		return undefined;
	}

	// ---- discovery ------------------------------------------------------------

	/** Scan folders of new projects and forget comments of projects that went away or moved their folder. */
	private syncFolders(): void {
		const live = get(projects);
		for (const [indexPath, folder] of [...this.scanned]) {
			const p = live.get(indexPath);
			if (p && this.folderFor(p) === folder) continue;
			this.scanned.delete(indexPath);
			this.forgetFolder(folder);
		}
		for (const p of live.values()) {
			if (this.scanned.has(p.indexPath)) continue;
			this.scanned.set(p.indexPath, this.folderFor(p));
			void this.scanProject(p);
		}
	}

	private forgetFolder(folder: string): void {
		for (const path of [...get(comments).keys()]) if (path.startsWith(folder + "/")) removeComment(path);
	}

	private async scanProject(project: Project): Promise<void> {
		const folder = this.app.vault.getFolderByPath(this.folderFor(project));
		if (!folder) return;
		const files: TFile[] = [];
		const visit = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFolder) visit(child);
				else if (child instanceof TFile && child.extension === "md") files.push(child);
			}
		};
		visit(folder);
		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isCommentFrontmatter(fm)) continue;
			try {
				const text = await this.app.vault.cachedRead(file);
				const parsed = parseComment(file.path, project.rootFolder, fm, text);
				if (parsed) setComment(parsed);
			} catch (e) {
				console.error("Novelr: could not read comment", file.path, e);
			}
		}
	}

	// ---- vault events ---------------------------------------------------------

	private onMetadataChanged(file: TFile, data: string, cache: CachedMetadata): void {
		const project = this.projectForCommentPath(file.path);
		if (!project) return;
		const parsed = isCommentFrontmatter(cache.frontmatter) ? parseComment(file.path, project.rootFolder, cache.frontmatter, data) : null;
		if (parsed) setComment(parsed);
		else removeComment(file.path);
	}

	private onDelete(file: TAbstractFile): void {
		if (file instanceof TFolder) {
			for (const path of [...get(comments).keys()]) if (path.startsWith(file.path + "/")) removeComment(path);
			return;
		}
		removeComment(file.path);
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		// A comment file (or a folder of them) moved: re-key what we hold.
		const isFolder = file instanceof TFolder;
		for (const [path, c] of [...get(comments)]) {
			if (path !== oldPath && !(isFolder && path.startsWith(oldPath + "/"))) continue;
			removeComment(path);
			const newPath = path === oldPath ? file.path : file.path + path.slice(oldPath.length);
			const project = this.projectForCommentPath(newPath);
			if (project) setComment({ ...c, filePath: newPath, rootFolder: project.rootFolder });
		}
		// A commented note moved inside its project: comments follow it.
		for (const project of get(projects).values()) {
			const folder = this.folderFor(project);
			if (isInside(folder, oldPath) || isInside(folder, file.path)) continue;
			const oldRel = relativeTo(project.rootFolder, oldPath);
			const newRel = relativeTo(project.rootFolder, file.path);
			if (oldRel === null || oldRel === "" || newRel === null || newRel === "") continue;
			for (const c of get(comments).values()) {
				if (c.rootFolder !== project.rootFolder) continue;
				const matches = c.note === oldRel || (isFolder && c.note.startsWith(oldRel + "/"));
				if (!matches) continue;
				const note = c.note === oldRel ? newRel : newRel + c.note.slice(oldRel.length);
				void this.patchFrontmatter(c, (fm) => {
					fm["note"] = note;
				});
			}
		}
	}

	// ---- writes ---------------------------------------------------------------

	/** Create a comment file; returns the comment or null on failure. */
	async create(project: Project, input: NewComment): Promise<Comment | null> {
		const folder = this.folderFor(project);
		const now = new Date();
		const id = newCommentId(now);
		const comment: Comment = {
			id,
			filePath: normalizePath(join(folder, `${id}.md`)),
			rootFolder: project.rootFolder,
			note: input.note,
			author: input.author.trim() || "Anonymous",
			created: now.toISOString(),
			status: "open",
			anchor: input.anchor,
			body: input.body.trim(),
			...(input.replyTo ? { replyTo: input.replyTo } : {}),
		};
		try {
			await this.ensureFolder(folder);
			await this.app.vault.create(comment.filePath, serializeComment(comment));
		} catch (e) {
			console.error("Novelr: could not create comment", e);
			new Notice("Could not save the comment.");
			return null;
		}
		setComment(comment);
		return comment;
	}

	async setStatus(comment: Comment, status: CommentStatus, by: string): Promise<void> {
		if (comment.status === status) return;
		const updated = new Date().toISOString();
		const next: Comment = { ...comment, status, updated };
		if (status === "resolved") next.resolvedBy = by.trim() || "Anonymous";
		else delete next.resolvedBy;
		setComment(next);
		await this.patchFrontmatter(comment, (fm) => {
			fm["status"] = status;
			fm["updated"] = updated;
			if (status === "resolved") fm["resolved-by"] = next.resolvedBy;
			else delete fm["resolved-by"];
		});
	}

	async editBody(comment: Comment, body: string, author: string): Promise<void> {
		const trimmed = body.trim();
		const updated = new Date().toISOString();
		const next: Comment = { ...comment, body: trimmed, updated };
		if (author.trim()) next.author = author.trim();
		setComment(next);
		const file = this.app.vault.getFileByPath(comment.filePath);
		if (!file) return;
		try {
			await this.app.vault.process(file, (text) => replaceCommentBody(text, trimmed));
			await this.patchFrontmatter(comment, (fm) => {
				fm["updated"] = updated;
				if (author.trim()) fm["author"] = author.trim();
			});
		} catch (e) {
			console.error("Novelr: could not edit comment", e);
			new Notice("Could not save the comment.");
		}
	}

	/** Trash a comment and its replies. */
	async delete(comment: Comment): Promise<void> {
		const victims = [comment, ...[...get(comments).values()].filter((c) => c.replyTo === comment.id && c.rootFolder === comment.rootFolder)];
		for (const c of victims) {
			removeComment(c.filePath);
			const file = this.app.vault.getFileByPath(c.filePath);
			if (!file) continue;
			try {
				await this.app.fileManager.trashFile(file);
			} catch (e) {
				console.error("Novelr: could not delete comment", e);
				new Notice("Could not delete the comment.");
			}
		}
	}

	private async patchFrontmatter(comment: Comment, mutate: (fm: Record<string, unknown>) => void): Promise<void> {
		const file = this.app.vault.getFileByPath(comment.filePath);
		if (!file) return;
		try {
			await this.app.fileManager.processFrontMatter(file, mutate);
		} catch (e) {
			console.error("Novelr: could not update comment", comment.filePath, e);
			new Notice("Could not update the comment.");
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		if (path === "" || this.app.vault.getFolderByPath(path)) return;
		await this.app.vault.createFolder(path);
	}

	/** The project a note belongs to, with the note's project-relative path. */
	locateNote(vaultPath: string): { project: Project; note: string } | undefined {
		const project = this.projectByRootContaining(vaultPath);
		if (!project) return undefined;
		const note = relativeTo(project.rootFolder, vaultPath);
		if (note === null || note === "" || isInside(project.commentsFolder, note)) return undefined;
		return { project, note };
	}

	private projectByRootContaining(path: string): Project | undefined {
		let best: Project | undefined;
		for (const p of get(projects).values()) {
			if (isInside(p.rootFolder, path) && (!best || p.rootFolder.length > best.rootFolder.length)) best = p;
		}
		return best;
	}

	/** Project of a comment (by root folder). */
	projectOf(comment: Comment): Project | undefined {
		return this.projectByRoot(comment.rootFolder);
	}
}
