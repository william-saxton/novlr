import { stripFrontmatter } from "../compile/steps/text";

/** Frontmatter key that marks a note as a Novelr comment file (value = format version). */
export const COMMENT_KEY = "novelr-comment";
/** Default name of the folder (inside the project root) that holds comment files. */
export const DEFAULT_COMMENTS_FOLDER = "_comments";
/** Characters of context kept on each side of a quote to disambiguate repeated phrases. */
export const CONTEXT_CHARS = 40;

export type CommentStatus = "open" | "resolved";

/** Where a comment sits in its note. `quote` is "" for note-level comments. */
export interface CommentAnchor {
	quote: string;
	before: string;
	after: string;
	/** Character offset of the quote in the note when the comment was made. */
	offset: number;
}

/**
 * A comment as held in memory. One markdown file per comment lives in the project's comments
 * folder; the frontmatter carries everything except `body`, which is the note text.
 */
export interface Comment {
	id: string;
	/** Vault path of the comment file. */
	filePath: string;
	/** Root folder of the project whose comments folder holds the file ("" for the vault root). */
	rootFolder: string;
	/** Path of the commented note, relative to the project root. */
	note: string;
	author: string;
	/** ISO 8601 timestamps. */
	created: string;
	updated?: string;
	status: CommentStatus;
	resolvedBy?: string;
	/** Id of the comment this one replies to; replies inherit the parent's anchor. */
	replyTo?: string;
	anchor: CommentAnchor | null;
	body: string;
}

/** Everything needed to create a comment file; the manager fills in id, timestamps and path. */
export interface NewComment {
	note: string;
	author: string;
	body: string;
	anchor: CommentAnchor | null;
	replyTo?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	// Obsidian parses unquoted ISO dates as strings, but be defensive about Date objects.
	if (v instanceof Date) return v.toISOString();
	return undefined;
}

/** True when the frontmatter belongs to a comment file. */
export function isCommentFrontmatter(fm: unknown): boolean {
	return isRecord(fm) && fm[COMMENT_KEY] !== undefined && fm[COMMENT_KEY] !== null;
}

/**
 * Build a Comment from a file's parsed frontmatter and full text. Returns null when the
 * frontmatter lacks the essentials (marker key, id, note). Tolerant of everything else.
 */
export function parseComment(filePath: string, rootFolder: string, frontmatter: unknown, text: string): Comment | null {
	if (!isCommentFrontmatter(frontmatter)) return null;
	const fm = frontmatter as Record<string, unknown>;
	const id = asString(fm["id"]);
	const note = asString(fm["note"]);
	if (!id || !note) return null;
	const quote = asString(fm["quote"]) ?? "";
	const anchor: CommentAnchor | null =
		quote.length > 0
			? {
					quote,
					before: asString(fm["before"]) ?? "",
					after: asString(fm["after"]) ?? "",
					offset: typeof fm["offset"] === "number" ? fm["offset"] : Number(fm["offset"] ?? 0) || 0,
				}
			: null;
	const status: CommentStatus = fm["status"] === "resolved" ? "resolved" : "open";
	const comment: Comment = {
		id,
		filePath,
		rootFolder,
		note: note.replace(/\\/g, "/"),
		author: asString(fm["author"]) ?? "Anonymous",
		created: asString(fm["created"]) ?? "",
		status,
		anchor,
		body: stripFrontmatter(text).replace(/^\n+/, "").replace(/\s+$/, ""),
	};
	const updated = asString(fm["updated"]);
	if (updated) comment.updated = updated;
	const resolvedBy = asString(fm["resolved-by"]);
	if (resolvedBy) comment.resolvedBy = resolvedBy;
	const replyTo = asString(fm["reply-to"]);
	if (replyTo) comment.replyTo = replyTo;
	return comment;
}

/** YAML scalar for a string: JSON strings are valid YAML double-quoted scalars. */
function yamlString(s: string): string {
	return JSON.stringify(s);
}

/** Frontmatter object in the order it is written; also what a resolve/edit rewrites. */
export function commentFrontmatter(comment: Comment): Record<string, string | number> {
	const fm: Record<string, string | number> = {
		[COMMENT_KEY]: 1,
		id: comment.id,
		note: comment.note,
		author: comment.author,
		created: comment.created,
	};
	if (comment.updated) fm["updated"] = comment.updated;
	fm["status"] = comment.status;
	if (comment.resolvedBy) fm["resolved-by"] = comment.resolvedBy;
	if (comment.replyTo) fm["reply-to"] = comment.replyTo;
	if (comment.anchor) {
		fm["quote"] = comment.anchor.quote;
		fm["before"] = comment.anchor.before;
		fm["after"] = comment.anchor.after;
		fm["offset"] = comment.anchor.offset;
	}
	return fm;
}

/** Full text of a comment file. */
export function serializeComment(comment: Comment): string {
	const lines = Object.entries(commentFrontmatter(comment)).map(([k, v]) =>
		typeof v === "number" ? `${k}: ${v}` : `${k}: ${yamlString(v)}`,
	);
	const body = comment.body.replace(/\s+$/, "");
	return `---\n${lines.join("\n")}\n---\n${body.length > 0 ? `\n${body}\n` : ""}`;
}

/** Replace the body of an existing comment file, keeping its frontmatter block byte-for-byte. */
export function replaceCommentBody(text: string, body: string): string {
	const stripped = stripFrontmatter(text);
	const head = text.slice(0, text.length - stripped.length);
	const trimmed = body.replace(/\s+$/, "");
	return `${head}${trimmed.length > 0 ? `\n${trimmed}\n` : ""}`;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Sortable, collision-resistant id: `20260926-134012-k3x9`. */
export function newCommentId(now: Date = new Date(), random: () => number = Math.random): string {
	const pad = (n: number): string => String(n).padStart(2, "0");
	const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
	let suffix = "";
	for (let i = 0; i < 4; i++) suffix += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)] ?? "x";
	return `${stamp}-${suffix}`;
}

/** Build an anchor for a selection `[from, to)` inside `text`. */
export function makeAnchor(text: string, from: number, to: number): CommentAnchor | null {
	const quote = text.slice(from, to);
	if (quote.length === 0) return null;
	return {
		quote,
		before: text.slice(Math.max(0, from - CONTEXT_CHARS), from),
		after: text.slice(to, to + CONTEXT_CHARS),
		offset: from,
	};
}

export interface Located {
	from: number;
	to: number;
	/** False when only the surrounding context was found and the quoted text itself changed. */
	exact: boolean;
}

function allIndexes(text: string, needle: string, limit = 200): number[] {
	const out: number[] = [];
	let i = text.indexOf(needle);
	while (i !== -1 && out.length < limit) {
		out.push(i);
		i = text.indexOf(needle, i + 1);
	}
	return out;
}

/** How many trailing characters of `a` equal the leading characters of `text` before `at`. */
function contextScore(text: string, at: number, end: number, anchor: CommentAnchor): number {
	let score = 0;
	const before = anchor.before;
	for (let i = 1; i <= before.length && at - i >= 0; i++) {
		if (text[at - i] === before[before.length - i]) score++;
		else break;
	}
	const after = anchor.after;
	for (let i = 0; i < after.length && end + i < text.length; i++) {
		if (text[end + i] === after[i]) score++;
		else break;
	}
	return score;
}

/**
 * Find the anchored range in the current note text. Prefers an exact quote match with the
 * best matching context, nearest to the recorded offset; falls back to the span between the
 * before/after contexts when the quoted text itself was edited. Null when nothing fits
 * (the comment is orphaned).
 */
export function locateAnchor(text: string, anchor: CommentAnchor | null): Located | null {
	if (!anchor || anchor.quote.length === 0) return null;
	const hits = allIndexes(text, anchor.quote);
	if (hits.length > 0) {
		let best = hits[0] as number;
		let bestScore = -1;
		for (const at of hits) {
			const score = contextScore(text, at, at + anchor.quote.length, anchor);
			const better = score > bestScore || (score === bestScore && Math.abs(at - anchor.offset) < Math.abs(best - anchor.offset));
			if (better) {
				best = at;
				bestScore = score;
			}
		}
		return { from: best, to: best + anchor.quote.length, exact: true };
	}
	// The quote changed: look for its context and mark whatever now sits between.
	const before = anchor.before.trimStart();
	const after = anchor.after.trimEnd();
	if (before.length < 8 || after.length < 8) return null;
	const starts = allIndexes(text, before);
	if (starts.length === 0) return null;
	let best: Located | null = null;
	for (const s of starts) {
		const from = s + before.length;
		const a = text.indexOf(after, from);
		if (a === -1) continue;
		// The rewritten passage should still be roughly the size of the original.
		if (a - from > anchor.quote.length * 3 + 200) continue;
		const candidate: Located = { from, to: a, exact: false };
		if (!best || Math.abs(from - anchor.offset) < Math.abs(best.from - anchor.offset)) best = candidate;
	}
	return best;
}

/** Short one-line preview of a quote for lists. */
export function previewQuote(quote: string, max = 80): string {
	const flat = quote.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Group a flat list into threads: roots in order with their replies sorted by creation. */
export interface Thread {
	root: Comment;
	replies: Comment[];
}

export function buildThreads(comments: Comment[]): Thread[] {
	const byId = new Map(comments.map((c) => [c.id, c]));
	const roots: Comment[] = [];
	const replies = new Map<string, Comment[]>();
	for (const c of comments) {
		const parent = c.replyTo && byId.has(c.replyTo) ? c.replyTo : undefined;
		if (parent === undefined) {
			roots.push(c);
			continue;
		}
		const list = replies.get(parent) ?? [];
		list.push(c);
		replies.set(parent, list);
	}
	const byCreated = (a: Comment, b: Comment): number => a.created.localeCompare(b.created) || a.id.localeCompare(b.id);
	return roots.map((root) => ({ root, replies: (replies.get(root.id) ?? []).sort(byCreated) }));
}
