import { derived, get, writable } from "svelte/store";
import type { Comment } from "./model";

/** Every comment file the manager knows about, keyed by the comment file's vault path. */
export const comments = writable<Map<string, Comment>>(new Map());

/** Id of the comment the pane should scroll to and highlight once; cleared after use. */
export const focusedCommentId = writable<string | null>(null);

/** Bumped (debounced) when an editor changes or the active leaf changes, so anchor states refresh. */
export const editorTick = writable(0);

export function bumpEditorTick(): void {
	editorTick.update((n) => n + 1);
}

/** Key used by per-note lookups. */
export function noteKey(rootFolder: string, note: string): string {
	return `${rootFolder}::${note}`;
}

/** Comments of one project, keyed by project-relative note path. */
export function commentsByNote(all: Map<string, Comment>, rootFolder: string): Map<string, Comment[]> {
	const out = new Map<string, Comment[]>();
	for (const c of all.values()) {
		if (c.rootFolder !== rootFolder) continue;
		const list = out.get(c.note) ?? [];
		list.push(c);
		out.set(c.note, list);
	}
	return out;
}

/** Open, top-level comment counts keyed by `noteKey(rootFolder, note)`; used by the structure tree. */
export const openCountByNote = derived(comments, ($comments) => {
	const counts = new Map<string, number>();
	for (const c of $comments.values()) {
		if (c.status !== "open" || c.replyTo) continue;
		const key = noteKey(c.rootFolder, c.note);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
});

export function setComment(comment: Comment): void {
	comments.update((map) => {
		const next = new Map(map);
		next.set(comment.filePath, comment);
		return next;
	});
}

export function removeComment(filePath: string): void {
	if (!get(comments).has(filePath)) return;
	comments.update((map) => {
		const next = new Map(map);
		next.delete(filePath);
		return next;
	});
}

export function commentById(id: string): Comment | undefined {
	for (const c of get(comments).values()) if (c.id === id) return c;
	return undefined;
}
