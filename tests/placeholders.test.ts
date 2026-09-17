import { describe, expect, it } from "vitest";
import { formatPlaceholders, toRoman, toWords } from "../src/compile/placeholders";
import { flattenNodes } from "../src/compile/numbering";
import { novelTree } from "./helpers";

const env = { projectTitle: "The Hollow Road", pageBreak: "<PB>", date: "2026-09-17" };

describe("toWords / toRoman", () => {
	it("converts numbers", () => {
		expect(toWords(0)).toBe("zero");
		expect(toWords(12)).toBe("twelve");
		expect(toWords(21)).toBe("twenty-one");
		expect(toWords(100)).toBe("one hundred");
		expect(toWords(342)).toBe("three hundred forty-two");
		expect(toWords(1001)).toBe("one thousand one");
		expect(toWords(12345)).toBe("12345");
		expect(toRoman(4)).toBe("IV");
		expect(toRoman(1994)).toBe("MCMXCIV");
		expect(toRoman(0)).toBe("0");
	});
});

describe("formatPlaceholders", () => {
	const root = novelTree();
	const nodes = Object.fromEntries(flattenNodes(root).map((n) => [n.title, n]));
	const call = nodes["The Call"]!;
	const ch2 = nodes["Chapter Two"]!;

	it("expands self fields and modifiers", () => {
		expect(formatPlaceholders("{title} #{number} of {count} ({absolute}) d{depth} i{index} {type}", call, env)).toBe(
			"The Call #2 of 2 (2) d2 i1 scene",
		);
		expect(formatPlaceholders("{number:word} {number:Word} {number:WORD} {number:roman} {number:Roman} {number:pad2} {number:pad3}", ch2, env)).toBe(
			"two Two TWO ii II 02 002",
		);
	});

	it("expands scoped fields", () => {
		expect(formatPlaceholders("{parent.title} {parent.number} {chapter.number:Roman} {chapter.title} {novel.title}", call, env)).toBe(
			"Chapter One 1 I Chapter One The Hollow Road",
		);
		expect(formatPlaceholders("{chapter.title}", ch2, env)).toBe("Chapter Two");
		expect(formatPlaceholders("{project.title} {date}", call, env)).toBe("The Hollow Road 2026-09-17");
	});

	it("handles BR, PB and the rule value", () => {
		expect(formatPlaceholders("a{BR}b{PB}", call, env)).toBe("a\nb<PB>");
		expect(formatPlaceholders(" ---- ", call, env)).toBe("---");
	});

	it("leaves unknown placeholders alone and reports them", () => {
		const unknown: string[] = [];
		expect(formatPlaceholders("{nope} {part.title} {title:bogus}", call, env, (p) => unknown.push(p))).toBe("{nope} {part.title} The Call");
		expect(unknown).toEqual(["{nope}", "{part.title}"]);
	});
});
