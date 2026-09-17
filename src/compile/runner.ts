import type { App } from "obsidian";
import type { Project, Schema } from "../model/types";
import { flattenNodes } from "./numbering";
import { formatPlaceholders } from "./placeholders";
import type { StepRegistry } from "./registry";
import {
	TARGETS_OPTION_ID,
	type CompileContext,
	type CompileNode,
	type FormatEnv,
	type JoinCompile,
	type ManuscriptCompile,
	type NodeCompile,
	type ProgressCallback,
	type RunResult,
	type ValidationResult,
	type Workflow,
} from "./types";
import { withDefaults } from "./workflows";

/** Check step availability, ordering (node* join manuscript*) and target types. */
export function validateWorkflow(workflow: Workflow, registry: StepRegistry, schema?: Schema): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	let seenJoin = false;
	let joins = 0;
	let writes = 0;
	workflow.steps.forEach((ws, i) => {
		const n = i + 1;
		const step = registry.get(ws.id);
		if (!step) {
			errors.push(`Step ${n}: "${ws.id}" is not available. Remove it or install the script.`);
			return;
		}
		const kind = step.description.kind;
		if (kind === "node" && seenJoin) errors.push(`Step ${n} (${step.description.name}) works on nodes but comes after the manuscript is built.`);
		if (kind === "manuscript" && !seenJoin) errors.push(`Step ${n} (${step.description.name}) works on the manuscript but no build step comes before it.`);
		if (kind === "join") {
			joins++;
			if (seenJoin) errors.push(`Step ${n}: only one build step is allowed.`);
			seenJoin = true;
		}
		if (ws.id === "write-to-note") writes++;
		if (kind === "node" && schema) {
			const targets = ws.optionValues[TARGETS_OPTION_ID];
			if (Array.isArray(targets)) {
				for (const t of targets) {
					if (typeof t === "string" && !schema.types.some((d) => d.id === t)) {
						warnings.push(`Step ${n} (${step.description.name}) targets "${t}", which this project's schema does not define.`);
					}
				}
			}
		}
	});
	if (workflow.steps.length === 0) errors.push("The workflow has no steps.");
	else if (joins === 0) errors.push("Add a build step so the structure is turned into a manuscript.");
	if (joins > 0 && writes === 0) warnings.push("Nothing saves the manuscript; add a save step or the output is discarded.");
	return { errors, warnings };
}

export interface RunParams {
	app: App;
	project: Project;
	root: CompileNode;
	workflow: Workflow;
	registry: StepRegistry;
	env: FormatEnv;
	onProgress?: ProgressCallback;
}

export async function runWorkflow(params: RunParams): Promise<RunResult> {
	const { app, project, root, workflow, registry, env, onProgress } = params;
	const result: RunResult = { ok: true, log: [], outputs: {} };
	const nodes = flattenNodes(root);
	let manuscript: string | null = null;

	for (let i = 0; i < workflow.steps.length; i++) {
		const ws = workflow.steps[i]!;
		const step = registry.get(ws.id);
		const name = step?.description.name ?? ws.id;
		onProgress?.(i, workflow.steps.length, name);
		const messages: string[] = [];
		const started = Date.now();
		const unknownPlaceholders = new Set<string>();
		const entry = { stepIndex: i, name, ms: 0, messages };
		result.log.push(entry);

		if (!step) {
			result.ok = false;
			result.error = `Step "${ws.id}" is not available.`;
			result.failedStep = i;
			return result;
		}

		const options = withDefaults(step.description, ws.optionValues);
		const ctx: CompileContext = {
			app,
			project,
			root,
			options,
			format: (fmt, node) => formatPlaceholders(fmt, node, env, (p) => unknownPlaceholders.add(p)),
			log: (m) => messages.push(m),
			outputs: result.outputs,
		};

		try {
			if (step.description.kind === "node") {
				const targets = options[TARGETS_OPTION_ID];
				const set = Array.isArray(targets) ? new Set(targets.filter((t): t is string => typeof t === "string")) : new Set<string>();
				const compile = step.compile as NodeCompile;
				let touched = 0;
				for (const node of nodes) {
					if (set.size > 0 && !set.has(node.typeId)) continue;
					await compile(node, ctx);
					touched++;
				}
				messages.push(`${touched} node${touched === 1 ? "" : "s"}`);
			} else if (step.description.kind === "join") {
				manuscript = await (step.compile as JoinCompile)(root, ctx);
				messages.push(`${manuscript.length} characters`);
			} else {
				if (manuscript === null) throw new Error("No manuscript has been built yet.");
				manuscript = await (step.compile as ManuscriptCompile)(manuscript, ctx);
			}
		} catch (e) {
			entry.ms = Date.now() - started;
			result.ok = false;
			result.error = e instanceof Error ? e.message : String(e);
			result.failedStep = i;
			return result;
		}
		if (unknownPlaceholders.size > 0) messages.push(`Unknown placeholders left as-is: ${[...unknownPlaceholders].join(", ")}`);
		entry.ms = Date.now() - started;
	}

	if (manuscript !== null) result.output = manuscript;
	return result;
}
