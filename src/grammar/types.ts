/** One problem the checker found. `line` is 1-based within the text that was sent. */
export interface GrammarFinding {
	line: number;
	/** Exact text on that line that has the problem. */
	quote: string;
	/** Short description, e.g. "subject-verb agreement". */
	issue: string;
	/** Suggested replacement for `quote`; empty when the fix is not a simple substitution. */
	fix: string;
}

export interface GrammarRequest {
	/** Numbered prose to check. */
	prompt: string;
	/** Model override; empty means the provider's default. */
	model: string;
	timeoutMs: number;
}

export interface GrammarProvider {
	readonly id: string;
	readonly name: string;
	/** True when this provider can run on the current platform with the current settings. */
	available(): string | null;
	/** Returns the raw model text; the caller parses it. */
	run(request: GrammarRequest, signal?: AbortSignal): Promise<string>;
}

export interface GrammarResult {
	placed: number;
	unplaced: GrammarFinding[];
	/** Findings the checker reported, before placement. */
	total: number;
}
