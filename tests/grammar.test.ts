import { describe, expect, it } from "vitest";
import { extractResult } from "../src/grammar/claudeCli";
import { buildPrompt, parseFindings } from "../src/grammar/prompt";
import { applyFindings, countGrammarComments, formatComment, prepareText, stripGrammarComments } from "../src/grammar/text";

const note = "---\nnovelr-type: scene\n---\n\n# Opening\n\nShe walk to the door. %% grammar: \"walk\" → \"walked\" — tense %%\n\nIt were cold outside.\n";

describe("prepareText", () => {
	it("drops frontmatter, blank lines and old grammar comments, numbering the rest", () => {
		const p = prepareText(note);
		expect(p.numbered).toBe("1: # Opening\n2: She walk to the door.\n3: It were cold outside.");
		expect(p.sent).toEqual([4, 6, 8]);
	});
});

describe("applyFindings", () => {
	it("places by line when the quote matches, falls back to search, reports the rest", () => {
		const p = prepareText(stripGrammarComments(note));
		const r = applyFindings(p, [
			{ line: 2, quote: "She walk", issue: "tense", fix: "She walked" },
			{ line: 1, quote: "It were", issue: "agreement", fix: "It was" }, // wrong line number
			{ line: 3, quote: "nowhere", issue: "x", fix: "" },
		]);
		expect(r.placed).toBe(2);
		expect(r.unplaced).toHaveLength(1);
		const lines = r.text.split("\n");
		expect(lines[6]).toBe('She walk to the door. %% grammar: "She walk" → "She walked" — tense %%');
		expect(lines[8]).toBe('It were cold outside. %% grammar: "It were" → "It was" — agreement %%');
	});

	it("round-trips through strip and count", () => {
		const p = prepareText("Hello there.\n");
		const r = applyFindings(p, [{ line: 1, quote: "there", issue: "", fix: "" }]);
		expect(countGrammarComments(r.text)).toBe(1);
		expect(stripGrammarComments(r.text)).toBe("Hello there.\n");
	});

	it("formatComment escapes comment markers", () => {
		expect(formatComment({ line: 1, quote: "a %% b", issue: "odd", fix: "" })).toBe('%% grammar: "a % b" — odd %%');
	});
});

describe("prompt", () => {
	it("includes guidance and the text", () => {
		const p = buildPrompt("1: Hi", { instructions: "British English", maxFindings: 5 });
		expect(p).toContain("British English");
		expect(p).toContain("at most 5");
		expect(p.endsWith("1: Hi")).toBe(true);
	});

	it("parses plain, fenced and prose-wrapped JSON", () => {
		const json = '[{"line": 2, "quote": "walk", "issue": "tense", "fix": "walked"}]';
		expect(parseFindings(json)).toEqual([{ line: 2, quote: "walk", issue: "tense", fix: "walked" }]);
		expect(parseFindings("```json\n" + json + "\n```")).toHaveLength(1);
		expect(parseFindings("Here you go:\n" + json + "\nDone.")).toHaveLength(1);
		expect(parseFindings("[]")).toEqual([]);
		expect(() => parseFindings("no json here")).toThrow();
	});

	it("extractResult unwraps the CLI envelope", () => {
		expect(extractResult('{"type":"result","is_error":false,"result":"[]"}')).toBe("[]");
		expect(extractResult("[]")).toBe("[]");
		expect(() => extractResult('{"is_error":true,"result":"Not logged in"}')).toThrow(/Not logged in/);
	});
});
