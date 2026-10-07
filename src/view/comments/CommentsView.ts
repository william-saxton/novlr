import { ItemView, MarkdownRenderer, MarkdownView, Menu, Notice, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { get } from "svelte/store";
import { type Comment, type CommentStatus, locateAnchor } from "../../comments/model";
import { comments } from "../../comments/store";
import { confirm } from "../../modals/ConfirmModal";
import { promptComment } from "../../modals/CommentModal";
import { join, stripMd, basename } from "../../model/paths";
import { findByPath } from "../../model/tree";
import type NovelrPlugin from "../../main";
import CommentsPanel from "./CommentsPanel.svelte";
import { COMMENT_CALLBACKS_KEY, type AnchorState, type CommentCallbacks } from "./context";

export const VIEW_TYPE_COMMENTS = "novelr-comments";

/** Right-side pane listing comments of the active note or the whole project. */
export class CommentsView extends ItemView {
	private component: Record<string, unknown> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: NovelrPlugin,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return VIEW_TYPE_COMMENTS;
	}

	override getDisplayText(): string {
		return "Novelr comments";
	}

	override getIcon(): string {
		return "message-square";
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass("novelr-view");
		this.component = mount(CommentsPanel, {
			target: this.contentEl,
			context: new Map<symbol, CommentCallbacks>([[COMMENT_CALLBACKS_KEY, this.callbacks()]]),
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

	private get manager() {
		return this.plugin.comments;
	}

	private vaultPath(comment: Comment): string {
		return join(comment.rootFolder, comment.note);
	}

	/** Latest copy of a comment from the store (the card may hold a stale object). */
	private live(comment: Comment): Comment {
		return get(comments).get(comment.filePath) ?? comment;
	}

	private callbacks(): CommentCallbacks {
		return {
			addNoteComment: () => void this.plugin.addCommentOnActiveNote(),
			reply: (comment) => void this.reply(this.live(comment)),
			edit: (comment) => void this.edit(this.live(comment)),
			setStatus: (comment, status) => void this.setStatus(this.live(comment), status),
			delete: (comment) => void this.delete(this.live(comment)),
			jump: (comment) => void this.jump(this.live(comment)),
			anchorState: (comment) => this.anchorState(comment),
			noteTitle: (comment) => this.noteTitle(comment),
			renderMarkdown: (el, text, sourcePath) => {
				void MarkdownRenderer.render(this.app, text, el, sourcePath, this);
			},
			showMenu: (event, items) => {
				const menu = new Menu();
				for (const spec of items) {
					menu.addItem((item) => {
						item.setTitle(spec.title).onClick(spec.onClick);
						if (spec.icon) item.setIcon(spec.icon);
						if (spec.danger) item.setWarning(true);
					});
				}
				menu.showAtMouseEvent(event);
			},
		};
	}

	private noteTitle(comment: Comment): string {
		const project = this.manager.projectOf(comment);
		const node = project ? findByPath(project.root, comment.note) : undefined;
		return node?.name ?? stripMd(basename(comment.note));
	}

	/** The markdown view showing the comment's note, if any. */
	private viewFor(comment: Comment): MarkdownView | undefined {
		const path = this.vaultPath(comment);
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path) return view;
		}
		return undefined;
	}

	private anchorState(comment: Comment): AnchorState {
		if (!comment.anchor) return "none";
		const view = this.viewFor(comment);
		if (!view) return "unknown";
		const hit = locateAnchor(view.editor.getValue(), comment.anchor);
		if (!hit) return "missing";
		return hit.exact ? "exact" : "moved";
	}

	private async jump(comment: Comment): Promise<void> {
		const path = this.vaultPath(comment);
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(`${comment.note} was not found.`);
			return;
		}
		let view = this.viewFor(comment);
		if (view) {
			await this.app.workspace.revealLeaf(view.leaf);
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		} else {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			view = leaf.view instanceof MarkdownView ? leaf.view : undefined;
		}
		if (!view || !comment.anchor) return;
		const editor = view.editor;
		const hit = locateAnchor(editor.getValue(), comment.anchor);
		if (!hit) {
			new Notice("The commented text is no longer in the note.");
			return;
		}
		const from = editor.offsetToPos(hit.from);
		const to = editor.offsetToPos(hit.to);
		editor.setSelection(from, to);
		editor.scrollIntoView({ from, to }, true);
		editor.focus();
	}

	private async reply(parent: Comment): Promise<void> {
		const project = this.manager.projectOf(parent);
		if (!project) return;
		const result = await promptComment(this.app, {
			title: `Reply to ${parent.author}`,
			quote: parent.body,
			author: this.manager.author(),
			submitText: "Reply",
		});
		if (!result) return;
		this.manager.setAuthor(result.author);
		const root = parent.replyTo ?? parent.id;
		await this.manager.create(project, { note: parent.note, author: result.author, body: result.body, anchor: null, replyTo: root });
	}

	private async edit(comment: Comment): Promise<void> {
		const result = await promptComment(this.app, {
			title: "Edit comment",
			...(comment.anchor ? { quote: comment.anchor.quote } : {}),
			author: comment.author,
			lockAuthor: true,
			initial: comment.body,
			submitText: "Save",
		});
		if (!result || result.body.trim() === comment.body) return;
		await this.manager.editBody(comment, result.body, "");
	}

	private async setStatus(comment: Comment, status: CommentStatus): Promise<void> {
		await this.manager.setStatus(comment, status, this.manager.author());
	}

	private async delete(comment: Comment): Promise<void> {
		const replies = [...get(comments).values()].filter((c) => c.replyTo === comment.id && c.rootFolder === comment.rootFolder).length;
		if (this.plugin.settings.confirmDelete) {
			const detail = replies > 0 ? ` and its ${replies} repl${replies === 1 ? "y" : "ies"}` : "";
			const ok = await confirm(this.app, {
				title: "Delete comment?",
				message: `The comment${detail} will be moved to the trash.`,
				confirmText: "Delete",
				danger: true,
			});
			if (!ok) return;
		}
		await this.manager.delete(comment);
	}
}
