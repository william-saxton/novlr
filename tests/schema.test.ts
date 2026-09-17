import { describe, expect, it } from "vitest";
import {
	BUILTIN_PRESETS,
	allowedChildTypes,
	canContain,
	defaultContentType,
	slugify,
	validateSchema,
} from "../src/model/schema";
import type { Schema } from "../src/model/types";

describe("schema", () => {
	it("built-in presets are valid", () => {
		for (const p of BUILTIN_PRESETS) expect(validateSchema(p.schema)).toEqual([]);
	});

	it("canContain respects allowedChildren and kinds", () => {
		const s = BUILTIN_PRESETS[0]!.schema;
		expect(canContain(s, "novel", "chapter")).toBe(true);
		expect(canContain(s, "novel", "scene")).toBe(false);
		expect(canContain(s, "scene", "scene")).toBe(false);
		expect(canContain(s, "chapter", "nope")).toBe(false);
		expect(allowedChildTypes(s, "chapter").map((t) => t.id)).toEqual(["scene"]);
		expect(defaultContentType(s, "novel")).toBe("scene");
	});

	it("empty allowedChildren means anything", () => {
		const s: Schema = {
			rootType: "box",
			types: [
				{ id: "box", name: "Box", kind: "container" },
				{ id: "note", name: "Note", kind: "content" },
			],
		};
		expect(canContain(s, "box", "box")).toBe(true);
		expect(canContain(s, "box", "note")).toBe(true);
	});

	it("validateSchema reports problems", () => {
		const s: Schema = {
			rootType: "scene",
			types: [
				{ id: "Bad Id", name: "", kind: "container", allowedChildren: ["ghost"] },
				{ id: "children", name: "X", kind: "content", allowedChildren: ["scene"] },
				{ id: "scene", name: "Scene", kind: "content" },
				{ id: "scene", name: "Scene", kind: "content" },
			],
		};
		const errors = validateSchema(s);
		expect(errors.some((e) => e.includes("must match"))).toBe(true);
		expect(errors.some((e) => e.includes("reserved"))).toBe(true);
		expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
		expect(errors.some((e) => e.includes("needs a name"))).toBe(true);
		expect(errors.some((e) => e.includes("unknown child"))).toBe(true);
		expect(errors.some((e) => e.includes("must be a container"))).toBe(true);
		expect(errors.some((e) => e.includes("cannot declare allowed children"))).toBe(true);
	});

	it("slugify", () => {
		expect(slugify("Chapter")).toBe("chapter");
		expect(slugify("  Sub Part! ")).toBe("sub-part");
		expect(slugify("123abc")).toBe("abc");
		expect(slugify("Émile")).toBe("emile");
		expect(slugify("!!!")).toBe("type");
	});
});
