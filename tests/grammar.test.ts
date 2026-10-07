import { describe, expect, it } from "vitest";
import { extractResult } from "../src/grammar/claudeCli";
import { buildPrompt, parseFindings } from "../src/grammar/prompt";
import { commentBody, locateFinding, prepareText, suggestionFor } from "../src/grammar/text";

const note = "---\nnovelr-type: scene\n---\n\n# Opening\n\nShe walk to the door.\n\nIt were cold outside.\n";

describe("prepareText", () => {
	it("skips frontmatter and blank lines, numbers the rest, and records offsets", () => {
		const p = prepareText(note);
		expect(p.numbered).toBe("1: # Opening\n2: She walk to the door.\n3: It were cold outside.");
		expect(p.sentLines).toEqual(["# Opening", "She walk to the door.", "It were cold outside."]);
		expect(p.starts.map((s) => note.slice(s, s + 5))).toEqual(["# Ope", "She w", "It we"]);
	});
});

describe("locateFinding", () => {
	const p = prepareText(note);

	it("uses the reported line when the quote is on it", () => {
		const span = locateFinding(p, { line: 2, quote: "She walk", issue: "", fix: "" })!;
		expect(note.slice(span.from, span.to)).toBe("She walk");
	});

	it("falls back to searching other lines when the line number is wrong", () => {
		const span = locateFinding(p, { line: 1, quote: "It were", issue: "", fix: "" })!;
		expect(note.slice(span.from, span.to)).toBe("It were");
	});

	it("marks the whole line for an empty quote and returns null for unknown text", () => {
		const span = locateFinding(p, { line: 3, quote: "", issue: "", fix: "" })!;
		expect(note.slice(span.from, span.to)).toBe("It were cold outside.");
		expect(locateFinding(p, { line: 3, quote: "nowhere", issue: "", fix: "" })).toBeNull();
		expect(locateFinding(p, { line: 99, quote: "", issue: "", fix: "" })).toBeNull();
	});
});

describe("commentBody", () => {
	it("combines issue and suggestion", () => {
		expect(commentBody({ line: 1, quote: "She walk", issue: "Tense", fix: "She walked" })).toBe("Tense\n\nSuggested: She walked");
		expect(commentBody({ line: 1, quote: "x", issue: "", fix: "x" })).toBe("Possible grammar issue.");
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

describe("suggestionFor", () => {
	it("uses the fix only when it replaces exactly the anchored quote", () => {
		expect(suggestionFor({ line: 1, quote: "She walk", issue: "", fix: "She walked" }, "She walk")).toBe("She walked");
		expect(suggestionFor({ line: 1, quote: "She walk", issue: "", fix: "She walk" }, "She walk")).toBeUndefined();
		expect(suggestionFor({ line: 1, quote: "She walk", issue: "", fix: "" }, "She walk")).toBeUndefined();
		expect(suggestionFor({ line: 1, quote: "She walk to", issue: "", fix: "She walked to" }, "She walk")).toBeUndefined();
	});

	it("commentBody omits the suggested line when a suggestion is attached", () => {
		expect(commentBody({ line: 1, quote: "a", issue: "Tense", fix: "b" }, true)).toBe("Tense");
		expect(commentBody({ line: 1, quote: "a", issue: "", fix: "b" }, true)).toBe("");
	});
});
