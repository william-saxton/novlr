import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject } from "../src/model/serialize";
import { reconcile, type DiskEntry } from "../src/vault/reconcile";

const root = parseProject("p/novelr.md", {
	schema: NOVEL_SCHEMA,
	tree: [
		{ chapter: "C1", children: [{ scene: "S1" }, { scene: "S2" }] },
		{ chapter: "C2", children: [{ scene: "S3" }] },
	],
}).project!.root;

describe("reconcile", () => {
	it("reports nothing when disk matches the tree", () => {
		const disk: DiskEntry[] = [
			{ path: "novelr.md", isFolder: false },
			{ path: "C1", isFolder: true },
			{ path: "C1/S1.md", isFolder: false },
			{ path: "C1/S2.md", isFolder: false },
			{ path: "C2", isFolder: true },
			{ path: "C2/S3.md", isFolder: false },
		];
		expect(reconcile(root, disk, [], "novelr.md")).toEqual({ unknown: [], missing: [] });
	});

	it("collapses an unknown folder to a single entry and reports missing", () => {
		const disk: DiskEntry[] = [
			{ path: "C1", isFolder: true },
			{ path: "C1/S1.md", isFolder: false },
			{ path: "C1/Draft.md", isFolder: false, guessedType: "scene" },
			{ path: "C1/notes.txt", isFolder: false },
			{ path: "Extra", isFolder: true },
			{ path: "Extra/Deep", isFolder: true },
			{ path: "Extra/Deep/x.md", isFolder: false },
			{ path: "_notes", isFolder: true },
			{ path: "_notes/chars.md", isFolder: false },
		];
		const result = reconcile(root, disk, ["_notes/**", "_notes"], "novelr.md");
		expect(result.unknown).toEqual([
			{ path: "C1/Draft.md", isFolder: false, guessedType: "scene" },
			{ path: "Extra", isFolder: true },
		]);
		expect(result.missing.sort()).toEqual(["C1/S2.md", "C2", "C2/S3.md"]);
	});

	it("treats a kind mismatch as both missing and unknown", () => {
		const disk: DiskEntry[] = [
			{ path: "C1", isFolder: true },
			{ path: "C1/S1.md", isFolder: true },
			{ path: "C1/S2.md", isFolder: false },
			{ path: "C2.md", isFolder: false },
		];
		const result = reconcile(root, disk, [], "novelr.md");
		expect(result.unknown.map((u) => u.path)).toEqual(["C1/S1.md", "C2.md"]);
		expect(result.missing.sort()).toEqual(["C1/S1.md", "C2", "C2/S3.md"]);
	});
});
