import { Notice } from "obsidian";
import { get } from "svelte/store";
import type NovelrPlugin from "../main";
import type { Project } from "../model/types";
import { workflows } from "../store/workflows";
import { buildCompileTree } from "./buildTree";
import { StepRegistry } from "./registry";
import { runWorkflow, validateWorkflow } from "./runner";
import { BUILTIN_STEPS } from "./steps";
import type { ProgressCallback, RunResult, ValidationResult, Workflow } from "./types";

/** Entry point for compiling projects; owns the step registry. */
export class CompileService {
	readonly registry = new StepRegistry(BUILTIN_STEPS);

	constructor(private readonly plugin: NovelrPlugin) {}

	workflows(): Workflow[] {
		return get(workflows);
	}

	findWorkflow(name: string | null): Workflow | undefined {
		if (!name) return undefined;
		return this.workflows().find((w) => w.name === name);
	}

	validate(project: Project, workflow: Workflow): ValidationResult {
		return validateWorkflow(workflow, this.registry, project.schema);
	}

	async compile(project: Project, workflow: Workflow, onProgress?: ProgressCallback): Promise<RunResult> {
		const validation = this.validate(project, workflow);
		if (validation.errors.length > 0) {
			return { ok: false, log: [], error: validation.errors[0], outputs: {} };
		}
		const { root, skipped, missing } = await buildCompileTree(this.plugin.app, project);
		const result = await runWorkflow({
			app: this.plugin.app,
			project,
			root,
			workflow,
			registry: this.registry,
			env: { projectTitle: project.title, pageBreak: this.plugin.settings.pageBreak },
			onProgress,
		});
		if (skipped.length > 0) result.log.unshift({ stepIndex: -1, name: "Skipped", ms: 0, messages: skipped });
		if (missing.length > 0) result.log.unshift({ stepIndex: -1, name: "Missing on disk", ms: 0, messages: missing });
		return result;
	}

	/** Compile with the project's selected workflow, reporting through notices. */
	async compileProject(project: Project): Promise<RunResult | null> {
		const workflow = this.findWorkflow(project.workflow) ?? this.workflows()[0];
		if (!workflow) {
			new Notice("No compile workflow is defined.");
			return null;
		}
		const result = await this.compile(project, workflow);
		if (result.ok) new Notice(`Compiled ${project.title} with ${workflow.name}.`);
		else new Notice(`Compile failed: ${result.error ?? "unknown error"}`);
		return result;
	}
}
