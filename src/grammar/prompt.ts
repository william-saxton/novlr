import type { GrammarFinding } from "./types";

export interface PromptOptions {
	/** Extra guidance from the user, e.g. dialect or genre conventions. */
	instructions: string;
	maxFindings: number;
}

/** Build the single prompt sent to the model. */
export function buildPrompt(numberedText: string, options: PromptOptions): string {
	const extra = options.instructions.trim();
	return [
		"You are a careful copy editor for fiction and other long-form prose.",
		"Find grammar, spelling, punctuation, agreement and tense-consistency errors in the numbered text below.",
		"Do not flag deliberate style: sentence fragments, dialogue voice, dialect, profanity, or formatting such as Markdown headings, emphasis and links.",
		"Do not rewrite for taste. Report only genuine errors.",
		`Report at most ${options.maxFindings} findings, most important first.`,
		extra ? `Additional guidance from the author: ${extra}` : "",
		"",
		"Respond with ONLY a JSON array, no prose and no code fence. Each element:",
		'{"line": <number from the text>, "quote": "<exact text on that line containing the error, copied verbatim>", "issue": "<short description>", "fix": "<replacement for quote, or empty string>"}',
		"If there are no errors, respond with [].",
		"",
		"TEXT:",
		numberedText,
	]
		.filter((l) => l !== undefined)
		.join("\n");
}

/** Extract the findings array from the model's reply, tolerating fences and stray prose. */
export function parseFindings(reply: string): GrammarFinding[] {
	const text = reply.trim();
	const candidates: string[] = [];
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	if (fenced?.[1]) candidates.push(fenced[1]);
	candidates.push(text);
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

	for (const c of candidates) {
		try {
			const parsed: unknown = JSON.parse(c);
			if (Array.isArray(parsed)) return parsed.flatMap(toFinding);
		} catch {
			// try the next candidate
		}
	}
	throw new Error("The checker did not return a JSON list of findings.");
}

function toFinding(v: unknown): GrammarFinding[] {
	if (typeof v !== "object" || v === null) return [];
	const o = v as Record<string, unknown>;
	const rawLine = o["line"];
	const line = typeof rawLine === "number" ? rawLine : typeof rawLine === "string" ? Number.parseInt(rawLine, 10) : Number.NaN;
	const quote = typeof o["quote"] === "string" ? o["quote"] : "";
	if (!Number.isFinite(line) && quote.length === 0) return [];
	return [
		{
			line: Number.isFinite(line) ? line : 0,
			quote,
			issue: typeof o["issue"] === "string" ? o["issue"] : "",
			fix: typeof o["fix"] === "string" ? o["fix"] : "",
		},
	];
}
