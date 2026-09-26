import { getContext } from "svelte";
import type { Comment, CommentStatus } from "../../comments/model";
import type { MenuItemSpec } from "../context";

export type AnchorState = "exact" | "moved" | "missing" | "unknown" | "none";

/** Imperative operations for the comments pane, implemented by CommentsView. */
export interface CommentCallbacks {
	/** Comment on the active note as a whole. */
	addNoteComment(): void;
	reply(comment: Comment): void;
	edit(comment: Comment): void;
	setStatus(comment: Comment, status: CommentStatus): void;
	delete(comment: Comment): void;
	/** Open the note and select the commented text. */
	jump(comment: Comment): void;
	/** Where the comment's text currently is in an open editor of its note. */
	anchorState(comment: Comment): AnchorState;
	/** Display name of the commented note (node name when it is in the tree). */
	noteTitle(comment: Comment): string;
	renderMarkdown(el: HTMLElement, text: string, sourcePath: string): void;
	showMenu(event: MouseEvent, items: MenuItemSpec[]): void;
}

export const COMMENT_CALLBACKS_KEY = Symbol("novelr-comment-callbacks");

export function getCommentCallbacks(): CommentCallbacks {
	return getContext<CommentCallbacks>(COMMENT_CALLBACKS_KEY);
}
