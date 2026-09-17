import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject } from "../src/model/serialize";
import { allNodes } from "../src/model/tree";
import type { Project } from "../src/model/types";
import { applyRename } from "../src/vault/applyRename";

function sample(): Project {
	return parseProject("p/novelr.md", {
		schema: NOVEL_SCHEMA,
		tree: [
			{ chapter: "C1", children: [{ scene: "S1" }, { scene: "S2" }] },
			{ chapter: "C2", children: [{ scene: "S3" }] },
		],
	}).project!;
}

const paths = (p: Project): string[] => allNodes(p.root).map((n) => n.path);

describe("applyRename", () => {
	it("renames a file in place", () => {
		const p = sample();
		expect(applyRename(p, "C1/S1.md", "C1/First.md")).toBe(true);
		expect(paths(p)).toEqual(["", "C1", "C1/First.md", "C1/S2.md", "C2", "C2/S3.md"]);
		expect(p.root.children[0]!.children[0]!.name).toBe("First");
	});

	it("renames a folder and cascades paths; child events are no-ops", () => {
		const p = sample();
		expect(applyRename(p, "C1", "One")).toBe(true);
		expect(paths(p)).toEqual(["", "One", "One/S1.md", "One/S2.md", "C2", "C2/S3.md"]);
		expect(applyRename(p, "C1/S1.md", "One/S1.md")).toBe(false);
	});

	it("moves a file into another container (appended at the end)", () => {
		const p = sample();
		expect(applyRename(p, "C1/S1.md", "C2/S1.md")).toBe(true);
		expect(paths(p)).toEqual(["", "C1", "C1/S2.md", "C2", "C2/S3.md", "C2/S1.md"]);
	});

	it("drops a node moved somewhere that is not a container node", () => {
		const p = sample();
		expect(applyRename(p, "C1/S1.md", "Loose/S1.md")).toBe(true);
		expect(paths(p)).not.toContain("C1/S1.md");
		expect(paths(p)).not.toContain("Loose/S1.md");
	});

	it("removes a node that left the project", () => {
		const p = sample();
		expect(applyRename(p, "C2", null)).toBe(true);
		expect(paths(p)).toEqual(["", "C1", "C1/S1.md", "C1/S2.md"]);
	});

	it("ignores untracked paths", () => {
		const p = sample();
		expect(applyRename(p, "nope.md", "yes.md")).toBe(false);
	});
});
