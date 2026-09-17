import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA, NOVEL_WITH_PARTS_SCHEMA, SHORT_STORY_SCHEMA, cloneSchema } from "../src/model/schema";
import { applySchemaChange, checkSchemaChange, missingTypesForPreset } from "../src/model/schemaOps";
import { parseProject } from "../src/model/serialize";
import { allNodes } from "../src/model/tree";
import type { Project } from "../src/model/types";

function sample(): Project {
	return parseProject("p/novelr.md", {
		schema: NOVEL_SCHEMA,
		tree: [{ chapter: "C1", children: [{ scene: "S1" }] }],
	}).project!;
}

describe("checkSchemaChange", () => {
	it("blocks removing or re-kinding a type in use", () => {
		const p = sample();
		const noScene = { ...cloneSchema(NOVEL_SCHEMA), types: NOVEL_SCHEMA.types.filter((t) => t.id !== "scene") };
		const e1 = checkSchemaChange(p, { ...noScene, types: [...noScene.types, { id: "beat", name: "Beat", kind: "content" }] }, {});
		expect(e1.some((e) => e.includes('"scene" is used by 1 node'))).toBe(true);
		const rekind = cloneSchema(NOVEL_SCHEMA);
		rekind.types.find((t) => t.id === "chapter")!.kind = "content";
		rekind.types.find((t) => t.id === "chapter")!.allowedChildren = undefined;
		const e2 = checkSchemaChange(p, rekind, {});
		expect(e2.some((e) => e.includes("kind cannot change"))).toBe(true);
	});

	it("accepts renames and additions", () => {
		const p = sample();
		const next = cloneSchema(NOVEL_SCHEMA);
		next.types.find((t) => t.id === "scene")!.id = "beat";
		next.types.find((t) => t.id === "chapter")!.allowedChildren = ["beat"];
		next.types.push({ id: "interlude", name: "Interlude", kind: "content" });
		expect(checkSchemaChange(p, next, { scene: "beat" })).toEqual([]);
		applySchemaChange(p, next, { scene: "beat" });
		expect(allNodes(p.root).map((n) => n.typeId)).toEqual(["novel", "chapter", "beat"]);
		expect(p.schema.types.map((t) => t.id)).toEqual(["novel", "chapter", "beat", "interlude"]);
	});

	it("applies a root type change", () => {
		const p = sample();
		const next = cloneSchema(NOVEL_SCHEMA);
		next.types.find((t) => t.id === "novel")!.id = "book";
		next.rootType = "book";
		expect(checkSchemaChange(p, next, { novel: "book" })).toEqual([]);
		applySchemaChange(p, next, { novel: "book" });
		expect(p.root.typeId).toBe("book");
	});
});

describe("missingTypesForPreset", () => {
	it("lists node types the preset cannot represent", () => {
		const p = sample();
		expect(missingTypesForPreset(p, NOVEL_WITH_PARTS_SCHEMA)).toEqual([]);
		expect(missingTypesForPreset(p, SHORT_STORY_SCHEMA)).toEqual(["chapter"]);
	});
});
