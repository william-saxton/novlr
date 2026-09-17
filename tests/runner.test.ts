import { describe, expect, it } from "vitest";
import { StepRegistry } from "../src/compile/registry";
import { runWorkflow, validateWorkflow } from "../src/compile/runner";
import { BUILTIN_STEPS } from "../src/compile/steps";
import type { CompileStep, Workflow } from "../src/compile/types";
import { DEFAULT_WORKFLOWS } from "../src/compile/workflows";
import { NOVEL_SCHEMA } from "../src/model/schema";
import type { Project } from "../src/model/types";
import { novelTree, tree } from "./helpers";

const registry = new StepRegistry(BUILTIN_STEPS);
const project = {
	indexPath: "The Hollow Road/novelr.md",
	rootFolder: "The Hollow Road",
	title: "The Hollow Road",
	schema: NOVEL_SCHEMA,
	workflow: null,
	ignore: [],
	unknown: [],
	missing: [],
	warnings: [],
} as unknown as Project;
const env = { projectTitle: "The Hollow Road", pageBreak: "<PB>" };
const app = {} as never;

/** The default workflows minus the save step, so they run without a vault. */
function withoutWrite(w: Workflow): Workflow {
	return { ...w, steps: w.steps.filter((s) => s.id !== "write-to-note") };
}

describe("validateWorkflow", () => {
	it("accepts the defaults", () => {
		for (const w of DEFAULT_WORKFLOWS) expect(validateWorkflow(w, registry, NOVEL_SCHEMA).errors).toEqual([]);
	});

	it("reports ordering problems, unknown steps and missing build", () => {
		const w: Workflow = {
			name: "bad",
			description: "",
			steps: [
				{ id: "normalize-blank-lines", optionValues: {} },
				{ id: "join-tree", optionValues: {} },
				{ id: "strip-frontmatter", optionValues: {} },
				{ id: "join-tree", optionValues: {} },
				{ id: "nope", optionValues: {} },
			],
		};
		const v = validateWorkflow(w, registry, NOVEL_SCHEMA);
		expect(v.errors.some((e) => e.includes("no build step comes before"))).toBe(true);
		expect(v.errors.some((e) => e.includes("comes after the manuscript"))).toBe(true);
		expect(v.errors.some((e) => e.includes("only one build step"))).toBe(true);
		expect(v.errors.some((e) => e.includes("not available"))).toBe(true);
		expect(validateWorkflow({ name: "e", description: "", steps: [] }, registry).errors).toContain("The workflow has no steps.");
		expect(validateWorkflow({ name: "n", description: "", steps: [{ id: "strip-frontmatter", optionValues: {} }] }, registry).errors[0]).toContain("build step");
	});

	it("warns about unknown targets and a missing save step", () => {
		const w: Workflow = {
			name: "w",
			description: "",
			steps: [
				{ id: "insert-before", optionValues: { targets: ["part"] } },
				{ id: "join-tree", optionValues: {} },
			],
		};
		const v = validateWorkflow(w, registry, NOVEL_SCHEMA);
		expect(v.errors).toEqual([]);
		expect(v.warnings.some((x) => x.includes('"part"'))).toBe(true);
		expect(v.warnings.some((x) => x.includes("Nothing saves"))).toBe(true);
	});
});

describe("runWorkflow", () => {
	it("produces the plain manuscript with the default workflow", async () => {
		const root = novelTree();
		const result = await runWorkflow({ app, project, root, workflow: withoutWrite(DEFAULT_WORKFLOWS[0]!), registry, env });
		expect(result.ok).toBe(true);
		expect(result.output).toBe("First scene text.\n\nSecond scene text.\n\nThird scene text.");
	});

	it("produces chapter headings and scene separators", async () => {
		const root = novelTree();
		root.children[0]!.children[0]!.text = "---\nnovelr-type: scene\n---\n\n# Opening\n\nSee [[Mara|her]].\n\n\n\nMore.";
		const result = await runWorkflow({ app, project, root, workflow: withoutWrite(DEFAULT_WORKFLOWS[1]!), registry, env });
		expect(result.ok).toBe(true);
		expect(result.output).toBe(
			[
				"# Chapter 1: Chapter One",
				"See her.",
				"More.",
				"* * *",
				"Second scene text.",
				"# Chapter 2: Chapter Two",
				"Third scene text.",
			].join("\n\n"),
		);
	});

	it("supports parts with roman numerals, page breaks and insert-after", async () => {
		const root = tree({
			type: "novel",
			title: "N",
			children: [
				{ type: "part", title: "Beginnings", children: [{ type: "chapter", title: "C", children: [{ type: "scene", title: "s", text: "one" }] }] },
				{ type: "part", title: "Endings", children: [{ type: "chapter", title: "D", children: [{ type: "scene", title: "t", text: "two" }] }] },
			],
		});
		const workflow: Workflow = {
			name: "parts",
			description: "",
			steps: [
				{ id: "insert-before", optionValues: { targets: ["part"], text: "{PB}# Part {number:Roman}{BR}{BR}## {title}" } },
				{ id: "insert-before", optionValues: { targets: ["chapter"], text: "### {part.number}.{number} {title}" } },
				{ id: "insert-after", optionValues: { targets: ["novel"], text: "THE END" } },
				{ id: "join-tree", optionValues: { joiner: "\\n\\n" } },
			],
		};
		const result = await runWorkflow({ app, project, root, workflow, registry, env });
		expect(result.output).toBe(
			["<PB># Part I\n\n## Beginnings", "### 1.1 C", "one", "<PB># Part II\n\n## Endings", "### 2.1 D", "two", "THE END"].join("\n\n"),
		);
	});

	it("reports a failing step", async () => {
		const boom: CompileStep = {
			description: { canonicalID: "boom", name: "Boom", description: "", kind: "manuscript", isScript: false, options: [] },
			compile: () => {
				throw new Error("kaboom");
			},
		};
		const reg = new StepRegistry([...BUILTIN_STEPS, boom]);
		const workflow: Workflow = {
			name: "f",
			description: "",
			steps: [
				{ id: "join-tree", optionValues: {} },
				{ id: "boom", optionValues: {} },
			],
		};
		const result = await runWorkflow({ app, project, root: novelTree(), workflow, registry: reg, env });
		expect(result.ok).toBe(false);
		expect(result.failedStep).toBe(1);
		expect(result.error).toBe("kaboom");
	});

	it("logs unknown placeholders", async () => {
		const workflow: Workflow = {
			name: "u",
			description: "",
			steps: [
				{ id: "insert-before", optionValues: { targets: ["scene"], text: "{nope}" } },
				{ id: "join-tree", optionValues: {} },
			],
		};
		const result = await runWorkflow({ app, project, root: novelTree(), workflow, registry, env });
		expect(result.log[0]!.messages.some((m) => m.includes("{nope}"))).toBe(true);
	});
});
