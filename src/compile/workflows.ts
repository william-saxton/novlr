import { TARGETS_OPTION, type StepDescription, type StepOption, type Workflow, type WorkflowStep } from "./types";

/** Options a workflow editor should show, including the implicit `targets` for node steps. */
export function optionsFor(description: StepDescription): StepOption[] {
	return description.kind === "node" ? [TARGETS_OPTION, ...description.options] : description.options;
}

/** Option values with defaults filled in for anything missing. */
export function withDefaults(description: StepDescription, values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const opt of optionsFor(description)) {
		const v = values[opt.id];
		out[opt.id] = v === undefined ? (Array.isArray(opt.default) ? [...opt.default] : opt.default) : v;
	}
	return out;
}

export function newWorkflowStep(description: StepDescription): WorkflowStep {
	return { id: description.canonicalID, optionValues: withDefaults(description, {}) };
}

export const DEFAULT_WORKFLOW_NAME = "Manuscript (default)";

export const DEFAULT_WORKFLOWS: Workflow[] = [
	{
		name: DEFAULT_WORKFLOW_NAME,
		description: "Strip properties and links, drop scene titles, flatten everything into one note.",
		steps: [
			{ id: "strip-frontmatter", optionValues: { targets: [] } },
			{ id: "remove-links", optionValues: { targets: [], wiki: "keep-text", external: "keep-text", embeds: "remove" } },
			{ id: "remove-headings", optionValues: { targets: ["scene"], mode: "all", maxLevel: "6" } },
			{ id: "join-tree", optionValues: { joiner: "\\n\\n" } },
			{ id: "write-to-note", optionValues: { path: "{root}/Manuscript/{project.title}.md", overwrite: true, open: true } },
		],
	},
	{
		name: "Chapter headings and scene separators",
		description: "Like the default, plus a heading for every chapter and a * * * between scenes.",
		steps: [
			{ id: "strip-frontmatter", optionValues: { targets: [] } },
			{ id: "remove-links", optionValues: { targets: [], wiki: "keep-text", external: "keep-text", embeds: "remove" } },
			{ id: "remove-headings", optionValues: { targets: ["scene"], mode: "all", maxLevel: "6" } },
			{ id: "insert-before", optionValues: { targets: ["chapter"], text: "# Chapter {number}: {title}", skipFirst: false } },
			{ id: "insert-before", optionValues: { targets: ["scene"], text: "* * *", skipFirst: true } },
			{ id: "join-tree", optionValues: { joiner: "\\n\\n" } },
			{ id: "normalize-blank-lines", optionValues: { max: "1" } },
			{ id: "write-to-note", optionValues: { path: "{root}/Manuscript/{project.title}.md", overwrite: true, open: true } },
		],
	},
];

export function cloneWorkflow(workflow: Workflow): Workflow {
	return {
		name: workflow.name,
		description: workflow.description,
		steps: workflow.steps.map((s) => ({ id: s.id, optionValues: structuredClone(s.optionValues) })),
	};
}

export function uniqueWorkflowName(base: string, existing: string[]): string {
	if (!existing.includes(base)) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base} ${i}`;
		if (!existing.includes(candidate)) return candidate;
	}
}
