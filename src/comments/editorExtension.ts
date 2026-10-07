import { StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { editorInfoField } from "obsidian";
import { get } from "svelte/store";
import type NovelrPlugin from "../main";
import { type Comment, hasSuggestion, locateAnchor, previewQuote } from "./model";
import { comments, focusedCommentId } from "./store";

/** Dispatch to re-anchor every highlight from scratch (after edits settle or comments change). */
export const refreshComments = StateEffect.define<null>();

const REANCHOR_DELAY_MS = 600;

export const COMMENT_MARK_CLASS = "novelr-comment-mark";

/**
 * Highlights the text each open comment refers to. Highlights follow edits by mapping through
 * changes, and are re-anchored from the stored quote once typing pauses, when the comment set
 * changes, or when the editor shows a different file.
 */
export function commentHighlighter(plugin: NovelrPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet = Decoration.none;
			private filePath: string | null = null;
			private unsubscribe: () => void;
			private timer: number | null = null;

			constructor(private readonly view: EditorView) {
				this.filePath = currentPath(view);
				this.decorations = this.build();
				this.unsubscribe = comments.subscribe(() => this.scheduleRefresh(0));
			}

			update(u: ViewUpdate): void {
				const path = currentPath(u.view);
				const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshComments)));
				if (path !== this.filePath || refresh) {
					this.filePath = path;
					this.decorations = this.build();
					return;
				}
				if (u.docChanged) {
					this.decorations = this.decorations.map(u.changes);
					this.scheduleRefresh(REANCHOR_DELAY_MS);
				}
			}

			destroy(): void {
				this.unsubscribe();
				if (this.timer !== null) window.clearTimeout(this.timer);
			}

			/** Dispatching inside an update is forbidden, so refreshes always go through a timer. */
			private scheduleRefresh(delay: number): void {
				if (this.timer !== null) window.clearTimeout(this.timer);
				this.timer = window.setTimeout(() => {
					this.timer = null;
					this.view.dispatch({ effects: refreshComments.of(null) });
				}, delay);
			}

			private build(): DecorationSet {
				if (!plugin.settings.highlightComments || !this.filePath) return Decoration.none;
				const located = plugin.comments.locateNote(this.filePath);
				if (!located) return Decoration.none;
				const relevant = [...get(comments).values()].filter(
					(c) => c.rootFolder === located.project.rootFolder && c.note === located.note && c.status === "open" && !c.replyTo && c.anchor,
				);
				if (relevant.length === 0) return Decoration.none;
				const text = this.view.state.doc.toString();
				const marks: { from: number; to: number; comment: Comment; exact: boolean }[] = [];
				for (const c of relevant) {
					const hit = locateAnchor(text, c.anchor);
					if (hit && hit.to > hit.from) marks.push({ from: hit.from, to: hit.to, comment: c, exact: hit.exact });
				}
				marks.sort((a, b) => a.from - b.from || a.to - b.to);
				return Decoration.set(
					marks.map((m) =>
						Decoration.mark({
							class: `${COMMENT_MARK_CLASS}${m.exact ? "" : " is-moved"}${hasSuggestion(m.comment) ? " is-suggestion" : ""}`,
							attributes: {
								"data-novelr-comment": m.comment.id,
								title: `${m.comment.author}: ${previewQuote(m.comment.body, 120)}`,
							},
						}).range(m.from, m.to),
					),
					true,
				);
			}
		},
		{
			decorations: (v) => v.decorations,
			eventHandlers: {
				click(event) {
					const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(`.${COMMENT_MARK_CLASS}`) : null;
					const id = target?.dataset["novelrComment"];
					if (!id) return false;
					focusedCommentId.set(id);
					void plugin.openCommentsPane(false);
					return false;
				},
			},
		},
	);
}

function currentPath(view: EditorView): string | null {
	try {
		return view.state.field(editorInfoField).file?.path ?? null;
	} catch {
		return null;
	}
}
