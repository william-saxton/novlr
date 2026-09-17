import type { CompileStep, StepDescription } from "./compile/types";
import type NovelrPlugin from "./main";

/**
 * Public API for other plugins. Reach it through
 * `app.plugins.plugins["novelr"]?.api` once Novelr is loaded.
 */
export class NovelrAPI {
	constructor(private readonly plugin: NovelrPlugin) {}

	/**
	 * Register a compile step. Give it a canonical id prefixed with your plugin id
	 * (for example "my-plugin:wordify") so it cannot collide with built-ins. Registering
	 * the same id again replaces the earlier step. Unregister on unload.
	 */
	registerStep(step: CompileStep): void {
		const description: StepDescription = { ...step.description, external: true };
		this.plugin.compiler.registry.register({ ...step, description } as CompileStep);
	}

	unregisterStep(canonicalID: string): void {
		this.plugin.compiler.registry.unregister(canonicalID);
	}

	/** Descriptions of every step currently available, built-in and registered. */
	steps(): StepDescription[] {
		return this.plugin.compiler.registry.all().map((s) => s.description);
	}
}
