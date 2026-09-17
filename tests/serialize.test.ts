import { describe, expect, it } from "vitest";
import { NOVEL_SCHEMA } from "../src/model/schema";
import { parseProject, serializeProject } from "../src/model/serialize";

const fm = {
	version: 1,
	title: "The Hollow Road",
	workflow: "Manuscript (default)",
	ignore: ["_notes/**"],
	schema: NOVEL_SCHEMA,
	tree: [
		{ chapter: "Chapter One", children: [{ scene: "Opening" }, { scene: "The Call" }] },
		{ chapter: "Chapter Two", children: [{ scene: "Aftermath" }] },
		{ chapter: "Empty" },
	],
};

describe("parseProject", () => {
	it("derives paths and root from the index location", () => {
		const { project, warnings } = parseProject("Books/The Hollow Road/novelr.md", fm);
		expect(warnings).toEqual([]);
		expect(project).not.toBeNull();
		expect(project!.rootFolder).toBe("Books/The Hollow Road");
		expect(project!.root.name).toBe("The Hollow Road");
		expect(project!.root.typeId).toBe("novel");
		expect(project!.root.path).toBe("");
		const ch1 = project!.root.children[0]!;
		expect(ch1.path).toBe("Chapter One");
		expect(ch1.kind).toBe("container");
		expect(ch1.children[1]!.path).toBe("Chapter One/The Call.md");
		expect(ch1.children[1]!.kind).toBe("content");
		expect(project!.workflow).toBe("Manuscript (default)");
		expect(project!.ignore).toEqual(["_notes/**"]);
	});

	it("handles a project at the vault root", () => {
		const { project } = parseProject("novelr.md", fm);
		expect(project!.rootFolder).toBe("");
		expect(project!.root.children[0]!.children[0]!.path).toBe("Chapter One/Opening.md");
	});

	it("is tolerant of bad entries", () => {
		const { project, warnings } = parseProject("p/novelr.md", {
			schema: NOVEL_SCHEMA,
			tree: [
				"Loose scene",
				{ chapter: "Ok", children: [{ scene: "A" }, { scene: "a" }, { scene: 5 }, { scene: "B", chapter: "X" }] },
				{ mystery: "Unknown type", children: [{ scene: "Inside" }] },
				{ scene: "Has kids", children: [{ scene: "Dropped" }] },
				42,
			],
		});
		expect(project).not.toBeNull();
		const names = project!.root.children.map((c) => c.name);
		expect(names).toEqual(["Loose scene", "Ok", "Unknown type", "Has kids"]);
		expect(project!.root.children[0]!.typeId).toBe("scene");
		expect(project!.root.children[1]!.children.map((c) => c.name)).toEqual(["A"]);
		expect(project!.root.children[2]!.kind).toBe("container");
		expect(project!.root.children[3]!.children).toEqual([]);
		expect(warnings.length).toBeGreaterThanOrEqual(6);
		expect(warnings.some((w) => w.includes("unknown type"))).toBe(true);
	});

	it("returns null for unusable input", () => {
		expect(parseProject("p/novelr.md", "nope").project).toBeNull();
		expect(parseProject("p/novelr.md", { tree: [] }).project).toBeNull();
	});

	it("round-trips through serializeProject", () => {
		const { project } = parseProject("Books/The Hollow Road/novelr.md", fm);
		const out = serializeProject(project!);
		expect(out).toEqual(fm);
	});

	it("omits empty optional fields when serializing", () => {
		const { project } = parseProject("p/novelr.md", { schema: NOVEL_SCHEMA, tree: [] });
		const out = serializeProject(project!);
		expect(out.workflow).toBeUndefined();
		expect(out.ignore).toBeUndefined();
		expect(out.title).toBe("novelr");
	});
});
