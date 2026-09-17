import type { CompileStep, StepKind } from "./types";

/** Built-in steps plus user scripts, looked up by canonical id. */
export class StepRegistry {
	private readonly steps = new Map<string, CompileStep>();

	constructor(builtins: CompileStep[]) {
		for (const s of builtins) this.steps.set(s.description.canonicalID, s);
	}

	get(id: string): CompileStep | undefined {
		return this.steps.get(id);
	}

	register(step: CompileStep): void {
		this.steps.set(step.description.canonicalID, step);
	}

	unregister(id: string): void {
		this.steps.delete(id);
	}

	all(): CompileStep[] {
		return [...this.steps.values()];
	}

	byKind(kind: StepKind): CompileStep[] {
		return this.all().filter((s) => s.description.kind === kind);
	}

	external(): CompileStep[] {
		return this.all().filter((s) => s.description.external);
	}
}
