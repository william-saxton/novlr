import { describe, expect, it } from "vitest";
import { renderNode } from "../src/compile/steps/joinTree";
import {
	normalizeBlankLines,
	removeComments,
	removeHeadings,
	removeLinks,
	removeStrikethroughs,
	replaceText,
	stripFrontmatter,
	trimWhitespace,
} from "../src/compile/steps/text";
import { novelTree } from "./helpers";

describe("stripFrontmatter", () => {
	it("removes a leading block only", () => {
		expect(stripFrontmatter("---\na: 1\nb: [x]\n---\n\nBody\n")).toBe("\nBody\n");
		expect(stripFrontmatter("---\r\na: 1\r\n---\r\nBody")).toBe("Body");
		expect(stripFrontmatter("Body\n---\nnot fm\n---\n")).toBe("Body\n---\nnot fm\n---\n");
		expect(stripFrontmatter("---\nunterminated")).toBe("---\nunterminated");
	});
});

describe("removeLinks", () => {
	const all = { wiki: "keep-text", external: "keep-text", embeds: "remove" } as const;
	it("handles wikilinks with aliases, paths and anchors", () => {
		expect(removeLinks("see [[Mara]] and [[People/Mara|her]] and [[Mara#Early life]] and [[#local]]", all)).toBe(
			"see Mara and her and Mara and local",
		);
		expect(removeLinks("[[Mara]]", { ...all, wiki: "remove" })).toBe("");
	});
	it("handles markdown links and embeds", () => {
		expect(removeLinks("a [site](https://x.y) ![[img.png]] ![alt](pic.png) b", all)).toBe("a site   b");
		expect(removeLinks("[site](https://x.y)", { ...all, external: "keep-url" })).toBe("https://x.y");
		expect(removeLinks("[site](https://x.y)", { ...all, external: "remove" })).toBe("");
		expect(removeLinks("![[img.png]]", { ...all, embeds: "keep" })).toBe("![[img.png]]");
	});
});

describe("removeComments / strikethroughs / whitespace", () => {
	it("works", () => {
		expect(removeComments("a %% hidden\nmulti %% b <!-- c --> d", true, true)).toBe("a  b  d");
		expect(removeComments("a %% x %% b", false, true)).toBe("a %% x %% b");
		expect(removeStrikethroughs("keep ~~drop\nthis~~ end")).toBe("keep  end");
		expect(trimWhitespace("\n\nline one   \nline two\t\n\n")).toBe("line one\nline two");
	});
});

describe("removeHeadings", () => {
	const text = "# Opening\n\nPara one.\n\n## Sub heading\n\nPara two.\n### Deep ##\nPara three.";
	it("mode all respects maxLevel and swallows one blank line", () => {
		expect(removeHeadings(text, "all", 6, "Opening")).toBe("Para one.\n\nPara two.\nPara three.");
		expect(removeHeadings(text, "all", 1, "Opening")).toBe("Para one.\n\n## Sub heading\n\nPara two.\n### Deep ##\nPara three.");
	});
	it("mode matching-title only removes the node title", () => {
		expect(removeHeadings(text, "matching-title", 6, "opening")).toBe("Para one.\n\n## Sub heading\n\nPara two.\n### Deep ##\nPara three.");
	});
	it("mode first-line only removes a heading before any content", () => {
		expect(removeHeadings("\n# Title\n\nBody\n# Later", "first-line", 6, "x")).toBe("\nBody\n# Later");
	});
});

describe("replaceText / normalizeBlankLines", () => {
	it("works", () => {
		expect(replaceText("a.b.c", ".", "-", false, "g")).toBe("a-b-c");
		expect(replaceText("a1b22c", "\\d+", "#", true, "g")).toBe("a#b#c");
		expect(replaceText("abc", "(", "x", true, "g")).toBe("abc");
		expect(replaceText("abc", "", "x", false, "g")).toBe("abc");
		expect(normalizeBlankLines("a\n\n\n\n\nb\n\nc", 1)).toBe("a\n\nb\n\nc");
		expect(normalizeBlankLines("a\n\n\n\nb", 2)).toBe("a\n\n\nb");
	});
});

describe("renderNode", () => {
	it("joins decorations, text and children; empty containers vanish", () => {
		const root = novelTree();
		const [ch1, ch2] = root.children as [typeof root, typeof root];
		ch1.before.push("# Chapter One");
		ch2.before.push("# Chapter Two");
		ch1.children[1]!.before.push("* * *");
		root.children.push({ ...ch2, title: "Empty", children: [], before: [], after: [] });
		root.after.push("THE END");
		expect(renderNode(root, "\n\n")).toBe(
			[
				"# Chapter One",
				"# Opening\n\nFirst scene text.",
				"* * *",
				"# The Call\n\nSecond scene text.",
				"# Chapter Two",
				"# Aftermath\n\nThird scene text.",
				"THE END",
			].join("\n\n"),
		);
	});
});
