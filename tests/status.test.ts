import { describe, expect, it } from "vitest";
import { filterByStatus } from "../src/compile/steps/filterStatus";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject, serializeProject } from "../src/model/serialize";
import { DEFAULT_STATUSES, computeEffectiveStatuses, validateStatuses } from "../src/model/status";
import type { StatusDef } from "../src/model/types";
import { tree } from "./helpers";

const fm = {
	version: 1,
	title: "T",
	schema: NOVEL_SCHEMA,
	statuses: [
		{ id: "new", name: "New", color: "blue", parent: "in-progress", default: true },
		{ id: "in-progress", name: "In progress", color: "yellow", parent: "in-progress" },
		{ id: "review", name: "Needs review", color: "orange", parent: "review" },
		{ id: "done", name: "Done", color: "green" },
	],
	tree: [
		{ chapter: "C1", status: "done", children: [{ scene: "S1", status: "done" }, { scene: "S2", status: "new" }] },
		{ chapter: "C2", status: "done", children: [{ scene: "S3", status: "done" }] },
		{ chapter: "C3", children: [{ scene: "S4", status: "review" }, { scene: "S5", status: "new" }] },
	],
};

describe("statuses", () => {
	it("round-trips through the index format", () => {
		const { project, warnings } = parseProject("p/novelr.md", fm);
		expect(warnings).toEqual([]);
		expect(project!.statuses).toHaveLength(4);
		expect(project!.root.children[0]!.children[1]!.status).toBe("new");
		expect(serializeProject(project!)).toEqual(fm);
	});

	it("defaults when the index has no statuses and warns on unknown ids", () => {
		const { project, warnings } = parseProject("p/novelr.md", {
			schema: NOVEL_SCHEMA,
			tree: [{ chapter: "C", status: "ghost" }],
		});
		expect(project!.statuses).toEqual(DEFAULT_STATUSES);
		expect(warnings.some((w) => w.includes('unknown status "ghost"'))).toBe(true);
	});

	it("pushes statuses up the chain, first listed wins", () => {
		const { project } = parseProject("p/novelr.md", fm);
		const eff = computeEffectiveStatuses(project!.root, project!.statuses);
		// Done chapter with a New scene inside shows In progress.
		expect(eff.get("C1")).toEqual({ explicit: "done", effective: "in-progress", fromChildren: true });
		expect(eff.get("C2")).toEqual({ explicit: "done", effective: "done", fromChildren: false });
		// Review is listed before... no: in-progress (index 1) beats review (index 2).
		expect(eff.get("C3")).toMatchObject({ explicit: undefined, effective: "in-progress", fromChildren: true });
		// And it keeps going up: the novel root is In progress too.
		expect(eff.get("")).toMatchObject({ effective: "in-progress", fromChildren: true });
	});

	it("validateStatuses", () => {
		const bad: StatusDef[] = [
			{ id: "Bad", name: "", color: "mauve", parent: "nope", default: true },
			{ id: "x", name: "X", default: true },
			{ id: "x", name: "Y" },
		];
		const errors = validateStatuses(bad);
		expect(errors.some((e) => e.includes("must match"))).toBe(true);
		expect(errors.some((e) => e.includes("needs a name"))).toBe(true);
		expect(errors.some((e) => e.includes("unknown color"))).toBe(true);
		expect(errors.some((e) => e.includes("unknown status"))).toBe(true);
		expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
		expect(errors.some((e) => e.includes("Only one"))).toBe(true);
		expect(validateStatuses(DEFAULT_STATUSES)).toEqual([]);
	});
});

describe("filterByStatus", () => {
	const build = () =>
		tree({
			type: "novel",
			title: "N",
			children: [
				{ type: "chapter", title: "C1", status: "in-progress", children: [{ type: "scene", title: "a", status: "done" }, { type: "scene", title: "b", status: "new" }] },
				{ type: "chapter", title: "C2", status: "done", children: [{ type: "scene", title: "c", status: "done" }] },
				{ type: "chapter", title: "C3", children: [{ type: "scene", title: "d" }] },
			],
		});

	it("exclude drops matching nodes and subtrees", () => {
		const root = build();
		expect(filterByStatus(root, "exclude", ["new", "done"])).toBe(4);
		expect(root.children.map((c) => [c.title, c.children.map((s) => s.title)])).toEqual([
			["C1", []],
			["C3", ["d"]],
		]);
	});

	it("include keeps matching content and the containers that hold it", () => {
		const root = build();
		expect(filterByStatus(root, "include", ["done"])).toBe(3);
		expect(root.children.map((c) => [c.title, c.children.map((s) => s.title)])).toEqual([
			["C1", ["a"]],
			["C2", ["c"]],
		]);
	});

	it("treats missing status as empty", () => {
		const root = build();
		filterByStatus(root, "exclude", [""]);
		expect(root.children.map((c) => c.title)).toEqual(["C1", "C2"]);
	});
});
