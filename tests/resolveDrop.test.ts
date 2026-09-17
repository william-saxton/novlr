import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject } from "../src/model/serialize";
import type { Schema } from "../src/model/types";
import { flatten } from "../src/view/structure/flatten";
import { resolveDrop, trimDragged } from "../src/view/structure/resolveDrop";

const project = parseProject("p/novelr.md", {
	schema: NOVEL_SCHEMA,
	tree: [
		{ chapter: "C1", children: [{ scene: "S1" }, { scene: "S2" }] },
		{ chapter: "C2", children: [{ scene: "S3" }] },
		{ chapter: "C3" },
	],
}).project!;

// rows: 0 C1, 1 S1, 2 S2, 3 C2, 4 S3, 5 C3
const rows = flatten(project, new Set());
const schema = project.schema;
const root = schema.rootType;

describe("trimDragged", () => {
	it("removes the dragged row and its descendants", () => {
		const d = trimDragged(rows, 0)!;
		expect(d.removed).toBe(3);
		expect(d.list.map((r) => r.node.name)).toEqual(["C2", "S3", "C3"]);
	});
});

describe("resolveDrop", () => {
	it("moves a scene to another chapter at the pointer depth", () => {
		const d = trimDragged(rows, 1)!; // S1; list: C1 S2 C2 S3 C3
		const t = resolveDrop(d, 4, 1, schema, root); // between S3 and C3
		expect(t).toMatchObject({ parentPath: "C2", index: 1, depth: 1 });
	});

	it("clamps depth: a scene cannot become a chapter sibling at depth 0", () => {
		const d = trimDragged(rows, 1)!;
		const t = resolveDrop(d, 4, 0, schema, root); // pointer at depth 0 but scenes are not allowed in novel
		expect(t).toMatchObject({ parentPath: "C2", index: 1, depth: 1 });
	});

	it("drops a scene into an empty chapter as first child", () => {
		const d = trimDragged(rows, 4)!; // S3; list: C1 S1 S2 C2 C3
		const t = resolveDrop(d, 5, 1, schema, root); // after C3
		expect(t).toMatchObject({ parentPath: "C3", index: 0, depth: 1 });
	});

	it("reorders chapters at depth 0 with post-removal index", () => {
		const d = trimDragged(rows, 3)!; // C2 + S3; list: C1 S1 S2 C3
		const t = resolveDrop(d, 4, 0, schema, root); // end of list
		expect(t).toMatchObject({ parentPath: "", index: 2, depth: 0 });
		const t2 = resolveDrop(d, 0, 0, schema, root);
		expect(t2).toMatchObject({ parentPath: "", index: 0, depth: 0 });
	});

	it("refuses a chapter inside a chapter and returns null when nothing is legal", () => {
		const d = trimDragged(rows, 5)!; // C3; list: C1 S1 S2 C2 S3
		const t = resolveDrop(d, 2, 1, schema, root); // between S1 and S2: only depth 1 possible
		expect(t).toBeNull();
		const t2 = resolveDrop(d, 3, 1, schema, root); // between S2 and C2: depths 1 or 0 -> 0 wins
		expect(t2).toMatchObject({ parentPath: "", index: 1, depth: 0 });
	});

	it("with no constraints picks the nearest depth to the pointer", () => {
		const free: Schema = {
			rootType: "box",
			types: [
				{ id: "box", name: "Box", kind: "container" },
				{ id: "note", name: "Note", kind: "content" },
			],
		};
		const p = parseProject("p/novelr.md", {
			schema: free,
			tree: [{ box: "A", children: [{ box: "B", children: [{ note: "n" }] }] }, { note: "m" }],
		}).project!;
		const r = flatten(p, new Set()); // A(0) B(1) n(2) m(0)
		const d = trimDragged(r, 3)!; // m; list: A B n
		expect(resolveDrop(d, 3, 5, free, "box")).toMatchObject({ parentPath: "A/B", index: 1, depth: 2 });
		expect(resolveDrop(d, 3, 1, free, "box")).toMatchObject({ parentPath: "A", index: 1, depth: 1 });
		expect(resolveDrop(d, 3, 0, free, "box")).toMatchObject({ parentPath: "", index: 1, depth: 0 });
	});
});
