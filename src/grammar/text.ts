import type { GrammarFinding } from "./types";

export const GRAMMAR_TAG = "grammar";

/** Matches one grammar comment, including a single leading space. */
const COMMENT_RE = /\s?%%\s*grammar:[\s\S]*?%%/g;

/** Remove every grammar comment from the text; other `%% %%` comments are left alone. */
export function stripGrammarComments(text: string): string {
	return text.replace(COMMENT_RE, "");
}

export function countGrammarComments(text: string): number {
	return (text.match(COMMENT_RE) ?? []).length;
}

export interface PreparedText {
	/** Lines of the original note. */
	lines: string[];
	/** Indices into `lines` that were sent, in order (frontmatter and blank lines excluded). */
	sent: number[];
	/** The numbered text to send. */
	numbered: string;
}

/**
 * Split a note for checking: drop frontmatter and existing grammar comments, skip blank
 * lines, and number the remaining lines so the model can refer to them.
 */
export function prepareText(text: string): PreparedText {
	const lines = text.split("\n");
	let start = 0;
	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (end !== -1) start = end + 1;
	}
	const sent: number[] = [];
	const out: string[] = [];
	for (let i = start; i < lines.length; i++) {
		const clean = stripGrammarComments(lines[i] as string);
		if (clean.trim().length === 0) continue;
		sent.push(i);
		out.push(`${sent.length}: ${clean}`);
	}
	return { lines, sent, numbered: out.join("\n") };
}

function sanitize(s: string): string {
	return s.replace(/%%/g, "%").replace(/\s+/g, " ").trim();
}

/** Render one finding as an Obsidian comment. */
export function formatComment(f: GrammarFinding): string {
	const issue = sanitize(f.issue);
	const quote = sanitize(f.quote);
	const fix = sanitize(f.fix);
	const body = fix.length > 0 ? `"${quote}" → "${fix}"` : `"${quote}"`;
	return `%% ${GRAMMAR_TAG}: ${body}${issue ? ` — ${issue}` : ""} %%`;
}

export interface ApplyResult {
	text: string;
	placed: number;
	unplaced: GrammarFinding[];
}

/**
 * Append a grammar comment to the line each finding refers to. The model's line number is
 * trusted only when the quoted text is really on that line; otherwise the first line
 * containing the quote wins; findings whose quote appears nowhere are returned unplaced.
 */
export function applyFindings(prepared: PreparedText, findings: GrammarFinding[]): ApplyResult {
	const lines = [...prepared.lines];
	const unplaced: GrammarFinding[] = [];
	let placed = 0;
	for (const f of findings) {
		const quote = f.quote.trim();
		const byNumber = prepared.sent[f.line - 1];
		let target: number | undefined;
		if (byNumber !== undefined && quote.length > 0 && stripGrammarComments(lines[byNumber] as string).includes(quote)) {
			target = byNumber;
		} else if (quote.length > 0) {
			target = prepared.sent.find((i) => stripGrammarComments(lines[i] as string).includes(quote));
		} else if (byNumber !== undefined) {
			target = byNumber;
		}
		if (target === undefined) {
			unplaced.push(f);
			continue;
		}
		lines[target] = `${lines[target] as string} ${formatComment(f)}`;
		placed++;
	}
	return { text: lines.join("\n"), placed, unplaced };
}
