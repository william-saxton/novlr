import { Notice, TFolder, normalizePath } from "obsidian";
import type NovelrPlugin from "../main";
import { basename, dirname, join, relativeTo, validateName } from "../model/paths";
import { canContain, defaultContainerType, defaultContentType, typeById } from "../model/schema";
import { applySchemaChange, checkSchemaChange, missingTypesForPreset } from "../model/schemaOps";
import { FRONTMATTER_KEY, NODE_TYPE_KEY, STATUS_KEY, newContentFileText } from "../model/serialize";
import { cloneStatuses, defaultStatusId, statusById, validateStatuses } from "../model/status";
import {
	cloneTree,
	findByPath,
	insertChild,
	moveNode as moveInTree,
	parentOf,
	removeByPath,
	siblingNames,
	uniqueName,
	walk,
} from "../model/tree";
import type { Project, ProjectNode, Schema, SchemaPreset, StatusDef, UnknownEntry } from "../model/types";
import { updateProject } from "../store/projects";
import { applyRename } from "./applyRename";

/**
 * Node operations. Each updates the store first (optimistic) and persists, then touches
 * the vault. Vault events that follow are no-ops thanks to the path-based reconciliation.
 */
export class NodeOps {
	constructor(private readonly plugin: NovelrPlugin) {}

	private get app() {
		return this.plugin.app;
	}

	private vaultPath(project: Project, rel: string): string {
		return normalizePath(join(project.rootFolder, rel));
	}

	private commit(project: Project, mutate: (p: Project) => void): void {
		updateProject(project.indexPath, (p) => {
			mutate(p);
			this.plugin.projectManager.refreshDiskState(p);
		});
		this.plugin.projectManager.schedulePersist(project.indexPath);
	}

	/** Snapshot of the tree for undo. */
	snapshot(project: Project): ProjectNode {
		return cloneTree(project.root);
	}

	restore(project: Project, root: ProjectNode): void {
		this.commit(project, (p) => {
			p.root = cloneTree(root);
		});
	}

	// ---- create -------------------------------------------------------------

	async createNode(project: Project, parentPath: string, typeId: string, rawName: string, index?: number): Promise<ProjectNode | null> {
		const parent = findByPath(project.root, parentPath);
		const def = typeById(project.schema, typeId);
		if (!parent || parent.kind !== "container" || !def) return null;
		if (!canContain(project.schema, parent.typeId, typeId)) {
			new Notice(`A ${def.name.toLowerCase()} cannot go inside a ${parent.typeId}.`);
			return null;
		}
		const error = validateName(rawName.trim());
		if (error) {
			new Notice(error);
			return null;
		}
		const name = uniqueName(rawName.trim(), siblingNames(parent));
		const status = defaultStatusId(project.statuses);
		const node: ProjectNode = { typeId, kind: def.kind, name, path: "", children: [] };
		if (status) node.status = status;
		this.commit(project, (p) => {
			const liveParent = findByPath(p.root, parentPath);
			if (liveParent) insertChild(liveParent, node, index);
		});

		const target = this.vaultPath(project, node.path);
		try {
			if (def.kind === "container") {
				if (!this.app.vault.getFolderByPath(target)) await this.app.vault.createFolder(target);
			} else if (!this.app.vault.getFileByPath(target)) {
				const parentFolder = dirname(target);
				if (parentFolder && !this.app.vault.getFolderByPath(parentFolder)) await this.app.vault.createFolder(parentFolder);
				await this.app.vault.create(target, newContentFileText(typeId, status, this.plugin.settings.writeNodeType));
			}
		} catch (e) {
			console.error("Novelr: create failed", e);
			new Notice(`Could not create ${name}.`);
			this.commit(project, (p) => {
				removeByPath(p.root, node.path);
			});
			return null;
		}
		return node;
	}

	// ---- rename / move ------------------------------------------------------

	async renameNode(project: Project, node: ProjectNode, rawName: string): Promise<boolean> {
		const name = rawName.trim();
		if (name === node.name) return true;
		const error = validateName(name);
		if (error) {
			new Notice(error);
			return false;
		}
		const parent = parentOf(project.root, node.path);
		if (!parent) return false;
		const taken = siblingNames(parent);
		taken.delete(node.name.toLowerCase());
		if (taken.has(name.toLowerCase())) {
			new Notice(`${name} already exists here.`);
			return false;
		}
		const oldRel = node.path;
		const newRel = join(dirname(oldRel), node.kind === "content" ? `${name}.md` : name);
		const file = this.app.vault.getAbstractFileByPath(this.vaultPath(project, oldRel));
		this.commit(project, (p) => {
			applyRename(p, oldRel, newRel);
		});
		if (!file) return true; // missing on disk: index-only rename
		try {
			await this.app.fileManager.renameFile(file, this.vaultPath(project, newRel));
		} catch (e) {
			console.error("Novelr: rename failed", e);
			new Notice(`Could not rename ${node.name}.`);
			this.commit(project, (p) => {
				applyRename(p, newRel, oldRel);
			});
			return false;
		}
		return true;
	}

	/** Move within the tree; moves the file/folder on disk when the parent changes. */
	async moveNode(project: Project, nodePath: string, newParentPath: string, index: number): Promise<boolean> {
		const node = findByPath(project.root, nodePath);
		const newParent = findByPath(project.root, newParentPath);
		if (!node || !newParent || newParent.kind !== "container") return false;
		if (!canContain(project.schema, newParent.typeId, node.typeId)) {
			new Notice(`A ${node.typeId} cannot go inside a ${newParent.typeId}.`);
			return false;
		}
		const oldParentPath = dirname(nodePath);
		if (oldParentPath === newParentPath) {
			this.commit(project, (p) => {
				moveInTree(p.root, nodePath, newParentPath, index);
			});
			return true;
		}
		const taken = siblingNames(newParent);
		if (taken.has(node.name.toLowerCase())) {
			new Notice(`${node.name} already exists in ${newParent.name}.`);
			return false;
		}
		const file = this.app.vault.getAbstractFileByPath(this.vaultPath(project, nodePath));
		this.commit(project, (p) => {
			moveInTree(p.root, nodePath, newParentPath, index);
		});
		if (!file) return true;
		const newRel = join(newParentPath, basename(nodePath));
		try {
			const targetFolder = this.vaultPath(project, newParentPath);
			if (targetFolder && !this.app.vault.getFolderByPath(targetFolder)) await this.app.vault.createFolder(targetFolder);
			await this.app.fileManager.renameFile(file, this.vaultPath(project, newRel));
		} catch (e) {
			console.error("Novelr: move failed", e);
			new Notice(`Could not move ${node.name}.`);
			this.commit(project, (p) => {
				applyRename(p, newRel, nodePath);
			});
			return false;
		}
		return true;
	}

	// ---- delete -------------------------------------------------------------

	async deleteNode(project: Project, node: ProjectNode): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.vaultPath(project, node.path));
		this.commit(project, (p) => {
			removeByPath(p.root, node.path);
		});
		if (!file) return;
		try {
			await this.app.fileManager.trashFile(file);
		} catch (e) {
			console.error("Novelr: delete failed", e);
			new Notice(`Could not delete ${node.name}.`);
		}
	}

	// ---- type ---------------------------------------------------------------

	async changeType(project: Project, node: ProjectNode, typeId: string): Promise<boolean> {
		const def = typeById(project.schema, typeId);
		if (!def) return false;
		if (def.kind !== node.kind) {
			new Notice(`${def.name} is a ${def.kind} type; ${node.name} is a ${node.kind}.`);
			return false;
		}
		const parent = parentOf(project.root, node.path);
		if (parent && !canContain(project.schema, parent.typeId, typeId)) {
			new Notice(`A ${def.name.toLowerCase()} cannot go inside a ${parent.typeId}.`);
			return false;
		}
		this.commit(project, (p) => {
			const live = findByPath(p.root, node.path);
			if (live) live.typeId = typeId;
		});
		if (node.kind === "content" && this.plugin.settings.writeNodeType) {
			const file = this.app.vault.getFileByPath(this.vaultPath(project, node.path));
			if (file) {
				await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm[NODE_TYPE_KEY] = typeId;
				});
			}
		}
		return true;
	}

	// ---- status -------------------------------------------------------------

	/** Set (or clear with null) a node's explicit status; mirrors it into content frontmatter when enabled. */
	async setStatus(project: Project, node: ProjectNode, statusId: string | null): Promise<void> {
		if (statusId !== null && !statusById(project.statuses, statusId)) return;
		this.commit(project, (p) => {
			const live = findByPath(p.root, node.path);
			if (!live) return;
			if (statusId === null) delete live.status;
			else live.status = statusId;
		});
		if (node.kind === "content" && this.plugin.settings.writeNodeType) {
			const file = this.app.vault.getFileByPath(this.vaultPath(project, node.path));
			if (file) {
				await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					if (statusId === null) delete fm[STATUS_KEY];
					else fm[STATUS_KEY] = statusId;
				});
			}
		}
	}

	/** Replace the status list. Renames map old ids to new ones for nodes that use them. Returns errors. */
	setStatuses(project: Project, statuses: StatusDef[], renames: Record<string, string>): string[] {
		const errors = validateStatuses(statuses);
		if (errors.length > 0) return errors;
		const ids = new Set(statuses.map((s) => s.id));
		const orphaned = new Set<string>();
		walk(project.root, (n) => {
			if (n.status === undefined) return;
			const next = renames[n.status] ?? n.status;
			if (!ids.has(next)) orphaned.add(n.status);
		});
		if (orphaned.size > 0) {
			return [`Nodes still use status${orphaned.size === 1 ? "" : "es"} ${[...orphaned].map((s) => `"${s}"`).join(", ")}. Change them first or keep the status.`];
		}
		this.commit(project, (p) => {
			walk(p.root, (n) => {
				if (n.status !== undefined && renames[n.status]) n.status = renames[n.status];
			});
			p.statuses = cloneStatuses(statuses);
			p.warnings = [];
		});
		return [];
	}

	// ---- unknown / missing --------------------------------------------------

	/** Pick a type for an unknown entry under `parentTypeId`, honoring the frontmatter hint. */
	suggestType(project: Project, entry: UnknownEntry, parentTypeId: string): string | undefined {
		const wantKind = entry.isFolder ? "container" : "content";
		const hinted = entry.guessedType ? typeById(project.schema, entry.guessedType) : undefined;
		if (hinted && hinted.kind === wantKind && canContain(project.schema, parentTypeId, hinted.id)) return hinted.id;
		return entry.isFolder ? defaultContainerType(project.schema, parentTypeId) : defaultContentType(project.schema, parentTypeId);
	}

	/** Add an unknown file or folder (recursively) to the tree. Returns false when no type fits. */
	addUnknown(project: Project, entry: UnknownEntry, typeId?: string): boolean {
		const parentPath = dirname(entry.path);
		const parent = findByPath(project.root, parentPath);
		if (!parent || parent.kind !== "container") {
			new Notice(`${parentPath || "The root"} is not a container in the index.`);
			return false;
		}
		const chosen = typeId ?? this.suggestType(project, entry, parent.typeId);
		const def = chosen ? typeById(project.schema, chosen) : undefined;
		if (!def || !canContain(project.schema, parent.typeId, def.id)) {
			new Notice(`No type in this schema can hold ${entry.path} under ${parent.typeId}.`);
			return false;
		}
		const built = this.buildFromDisk(project, entry, def.id);
		if (!built) return false;
		this.commit(project, (p) => {
			const liveParent = findByPath(p.root, parentPath);
			if (liveParent && !findByPath(p.root, entry.path)) insertChild(liveParent, built);
		});
		return true;
	}

	private buildFromDisk(project: Project, entry: UnknownEntry, typeId: string): ProjectNode | null {
		const def = typeById(project.schema, typeId);
		if (!def) return null;
		const name = entry.isFolder ? basename(entry.path) : basename(entry.path).replace(/\.md$/i, "");
		const node: ProjectNode = { typeId, kind: def.kind, name, path: entry.path, children: [] };
		const status =
			entry.guessedStatus && statusById(project.statuses, entry.guessedStatus) ? entry.guessedStatus : defaultStatusId(project.statuses);
		if (status) node.status = status;
		if (!entry.isFolder) return node;
		const folder = this.app.vault.getFolderByPath(this.vaultPath(project, entry.path));
		if (!folder) return node;
		const children = [...folder.children].sort((a, b) => a.name.localeCompare(b.name));
		for (const child of children) {
			const rel = relativeTo(project.rootFolder, child.path);
			if (rel === null) continue;
			const isFolder = child instanceof TFolder;
			if (!isFolder && !child.path.toLowerCase().endsWith(".md")) continue;
			const fm = isFolder ? undefined : this.app.metadataCache.getFileCache(child as never)?.frontmatter;
			const guessed: unknown = fm?.[NODE_TYPE_KEY];
			const guessedStatus: unknown = fm?.[STATUS_KEY];
			const childEntry: UnknownEntry = {
				path: rel,
				isFolder,
				...(typeof guessed === "string" ? { guessedType: guessed } : {}),
				...(typeof guessedStatus === "string" ? { guessedStatus } : {}),
			};
			const childType = this.suggestType(project, childEntry, typeId);
			if (!childType) continue;
			const childNode = this.buildFromDisk(project, childEntry, childType);
			if (childNode) node.children.push(childNode);
		}
		return node;
	}

	ignoreUnknown(project: Project, entry: UnknownEntry): void {
		this.commit(project, (p) => {
			if (!p.ignore.includes(entry.path)) p.ignore.push(entry.path);
		});
	}

	removeMissing(project: Project, path: string): void {
		this.commit(project, (p) => {
			removeByPath(p.root, path);
		});
	}

	setTitle(project: Project, title: string): void {
		this.commit(project, (p) => {
			p.title = title.trim() || p.title;
		});
	}

	setWorkflow(project: Project, workflow: string | null): void {
		this.commit(project, (p) => {
			p.workflow = workflow;
		});
	}

	setIgnore(project: Project, patterns: string[]): void {
		this.commit(project, (p) => {
			p.ignore = patterns.map((s) => s.trim()).filter((s) => s.length > 0);
		});
	}

	// ---- schema -------------------------------------------------------------

	/** Replace the schema, renaming node type ids as requested. Returns errors; applies only when empty. */
	setSchema(project: Project, schema: Schema, renames: Record<string, string>): string[] {
		const errors = checkSchemaChange(project, schema, renames);
		if (errors.length > 0) return errors;
		this.commit(project, (p) => {
			applySchemaChange(p, schema, renames);
			p.warnings = [];
		});
		return [];
	}

	/** Load a preset schema. Returns errors when the project's nodes need types the preset lacks. */
	loadPreset(project: Project, preset: SchemaPreset): string[] {
		const missing = missingTypesForPreset(project, preset.schema);
		if (missing.length > 0) {
			return [`This project uses type${missing.length === 1 ? "" : "s"} ${missing.map((m) => `"${m}"`).join(", ")} which "${preset.name}" does not define.`];
		}
		return this.setSchema(project, preset.schema, {});
	}

	/** Delete the `novelr` property from the index note; files are left alone. */
	async removeProject(project: Project): Promise<void> {
		const file = this.app.vault.getFileByPath(project.indexPath);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm[FRONTMATTER_KEY];
		});
	}
}
