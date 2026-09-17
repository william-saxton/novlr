import { describe, expect, it } from "vitest";
import { basename, dirname, isInside, join, relativeTo, stripMd, validateName } from "../src/model/paths";

describe("paths", () => {
	it("joins and normalizes", () => {
		expect(join("a", "b", "c.md")).toBe("a/b/c.md");
		expect(join("", "b")).toBe("b");
		expect(join("a/", "/b")).toBe("a/b");
	});

	it("dirname and basename", () => {
		expect(dirname("a/b/c.md")).toBe("a/b");
		expect(dirname("c.md")).toBe("");
		expect(basename("a/b/c.md")).toBe("c.md");
		expect(stripMd("c.MD")).toBe("c");
		expect(stripMd("c")).toBe("c");
	});

	it("isInside and relativeTo", () => {
		expect(isInside("", "anything")).toBe(true);
		expect(isInside("a", "a")).toBe(true);
		expect(isInside("a", "a/b")).toBe(true);
		expect(isInside("a", "ab")).toBe(false);
		expect(relativeTo("a", "a/b/c")).toBe("b/c");
		expect(relativeTo("a", "a")).toBe("");
		expect(relativeTo("a", "b")).toBeNull();
		expect(relativeTo("", "b")).toBe("b");
	});

	it("validateName", () => {
		expect(validateName("Chapter One")).toBeNull();
		expect(validateName("")).not.toBeNull();
		expect(validateName(" x")).not.toBeNull();
		expect(validateName("a/b")).not.toBeNull();
		expect(validateName(".hidden")).not.toBeNull();
		expect(validateName("end.")).not.toBeNull();
	});
});
