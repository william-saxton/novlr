import { describe, expect, it } from "vitest";
import { compileGlobs, globToRegExp, matchesAny } from "../src/model/glob";

describe("globToRegExp", () => {
	it("matches ** at any depth", () => {
		const re = globToRegExp("_notes/**");
		expect(re.test("_notes/a.md")).toBe(true);
		expect(re.test("_notes/deep/b.md")).toBe(true);
		expect(re.test("notes/a.md")).toBe(false);
	});

	it("matches * within a segment only", () => {
		const re = globToRegExp("Chapter One/*.md");
		expect(re.test("Chapter One/a.md")).toBe(true);
		expect(re.test("Chapter One/sub/a.md")).toBe(false);
	});

	it("matches basename when the pattern has no slash", () => {
		const re = globToRegExp("*-scratch.md");
		expect(re.test("Chapter One/idea-scratch.md")).toBe(true);
		expect(re.test("idea-scratch.md")).toBe(true);
		expect(re.test("idea-scratch.md.bak")).toBe(false);
	});

	it("escapes regex specials and supports ?", () => {
		expect(globToRegExp("a.b?").test("a.bc")).toBe(true);
		expect(globToRegExp("a.b?").test("axbc")).toBe(false);
	});

	it("matchesAny ignores blank patterns", () => {
		const res = compileGlobs(["", "  ", "x/**"]);
		expect(res).toHaveLength(1);
		expect(matchesAny(res, "x/y")).toBe(true);
		expect(matchesAny(res, "y")).toBe(false);
	});
});
