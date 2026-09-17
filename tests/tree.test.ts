import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject } from "../src/model/serialize";
import {
	contentNodes,
	findByPath,
	insertChild,
	moveNode,
	parentOf,
	removeByPath,
	uniqueName,
	walk,
} from "../src/model/tree";
import type { ProjectNode } from "../src/model/types";

function sample(): ProjectNode {
	return parseProject("p/novelr.md", {
		schema: NOVEL_SCHEMA,
		tree: [
			{ chapter: "C1", children: [{ scene: "S1" }, { scene: "S2" }] },
			{ chapter: "C2", children: [{ scene: "S3" }] },
		],
	}).project!.root;
}

describe("tree", () => {
	it("walks in pre-order and can skip subtrees", () => {
		const seen: string[] = [];
		walk(sample(), (n) => {
			seen.push(n.path);
			if (n.path === "C1") return false;
			return undefined;
		});
		expect(seen).toEqual(["", "C1", "C2", "C2/S3.md"]);
	});

	it("finds nodes and parents", () => {
		const root = sample();
		expect(findByPath(root, "C1/S2.md")?.name).toBe("S2");
		expect(parentOf(root, "C1/S2.md")?.path).toBe("C1");
		expect(parentOf(root, "C1")?.path).toBe("");
		expect(parentOf(root, "")).toBeUndefined();
	});

	it("moves a node across parents and recomputes paths", () => {
		const root = sample();
		expect(moveNode(root, "C1/S1.md", "C2", 1)).toBe(true);
		expect(root.children[0]!.children.map((c) => c.path)).toEqual(["C1/S2.md"]);
		expect(root.children[1]!.children.map((c) => c.path)).toEqual(["C2/S3.md", "C2/S1.md"]);
	});

	it("reorders within the same parent using post-removal index", () => {
		const root = sample();
		expect(moveNode(root, "C1/S2.md", "C1", 0)).toBe(true);
		expect(root.children[0]!.children.map((c) => c.name)).toEqual(["S2", "S1"]);
	});

	it("refuses invalid moves", () => {
		const root = sample();
		expect(moveNode(root, "C1", "C1/S1.md", 0)).toBe(false);
		expect(moveNode(root, "C1", "C1", 0)).toBe(false);
		expect(moveNode(root, "", "C1", 0)).toBe(false);
		expect(moveNode(root, "nope", "C1", 0)).toBe(false);
	});

	it("inserts and removes", () => {
		const root = sample();
		const c1 = findByPath(root, "C1")!;
		insertChild(c1, { typeId: "scene", kind: "content", name: "New", path: "", children: [] }, 1);
		expect(c1.children.map((c) => c.path)).toEqual(["C1/S1.md", "C1/New.md", "C1/S2.md"]);
		expect(removeByPath(root, "C1/New.md")?.name).toBe("New");
		expect(removeByPath(root, "")).toBeUndefined();
	});

	it("lists content nodes in document order", () => {
		expect(contentNodes(sample()).map((n) => n.name)).toEqual(["S1", "S2", "S3"]);
	});

	it("generates unique names", () => {
		const taken = new Set(["scene", "scene 2"]);
		expect(uniqueName("Scene", taken)).toBe("Scene 3");
		expect(uniqueName("Other", taken)).toBe("Other");
	});
});
