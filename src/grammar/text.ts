import type { GrammarFinding } from "./types";

export interface PreparedText {
	/** The note text the offsets refer to. */
	text: string;
	/** Character offset where each sent line starts in `text`, in sent order. */
	starts: number[];
	/** The sent lines themselves (without numbering), in sent order. */
	sentLines: string[];
	/** The numbered text to send to the model. */
	numbered: string;
}

/**
 * Split a note for checking: skip frontmatter and blank lines, number the remaining lines
 * so the model can refer to them, and remember where each one starts in the note.
 */
export function prepareText(text: string): PreparedText {
	const lines = text.split("\n");
	let start = 0;
	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (end !== -1) start = end + 1;
	}
	const starts: number[] = [];
	const sentLines: string[] = [];
	const numbered: string[] = [];
	let offset = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (i >= start && line.trim().length > 0) {
			starts.push(offset);
			sentLines.push(line);
			numbered.push(`${sentLines.length}: ${line}`);
		}
		offset += line.length + 1;
	}
	return { text, starts, sentLines, numbered: numbered.join("\n") };
}

export interface Span {
	from: number;
	to: number;
}

/**
 * Find the character span a finding refers to. The model's line number is trusted only
 * when the quote is really on that line; otherwise the first line containing the quote
 * wins. A finding with an empty quote marks the whole reported line. Null when nothing matches.
 */
export function locateFinding(prepared: PreparedText, finding: GrammarFinding): Span | null {
	const quote = finding.quote.trim();
	const index = finding.line - 1;
	const onLine = (i: number): Span | null => {
		const line = prepared.sentLines[i];
		const start = prepared.starts[i];
		if (line === undefined || start === undefined) return null;
		if (quote.length === 0) return { from: start, to: start + line.length };
		const col = line.indexOf(quote);
		return col === -1 ? null : { from: start + col, to: start + col + quote.length };
	};
	const direct = onLine(index);
	if (direct) return direct;
	if (quote.length === 0) return null;
	for (let i = 0; i < prepared.sentLines.length; i++) {
		if (i === index) continue;
		const span = onLine(i);
		if (span) return span;
	}
	return null;
}

/**
 * The replacement to attach as an acceptable suggestion: the model's fix when it is a real
 * change to exactly the anchored text. Undefined means "comment only".
 */
export function suggestionFor(finding: GrammarFinding, anchoredQuote: string): string | undefined {
	const fix = finding.fix.trim();
	if (fix.length === 0 || anchoredQuote.length === 0) return undefined;
	if (fix === anchoredQuote) return undefined;
	// The fix must replace the quote as anchored; if the model quoted more than we anchored, keep it as text only.
	if (finding.quote.trim() !== anchoredQuote) return undefined;
	return fix;
}

/** Body text of the comment created for a finding. */
export function commentBody(finding: GrammarFinding, hasSuggestion = false): string {
	const issue = finding.issue.trim();
	const fix = finding.fix.trim();
	const parts: string[] = [];
	if (issue) parts.push(issue);
	if (!hasSuggestion && fix && fix !== finding.quote.trim()) parts.push(`Suggested: ${fix}`);
	return parts.join("\n\n") || (hasSuggestion ? "" : "Possible grammar issue.");
}
