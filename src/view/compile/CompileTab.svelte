<script lang="ts">
	import type { RunResult, ValidationResult } from "../../compile/types";
	import type { Project } from "../../model/types";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	let workflows = $derived(callbacks.listWorkflows());
	let selectedName = $derived(project.workflow && workflows.some((w) => w.name === project.workflow) ? project.workflow : (workflows[0]?.name ?? null));
	let validation: ValidationResult | null = $derived(selectedName ? callbacks.validateWorkflow(project, selectedName) : null);

	let running = $state(false);
	let progress = $state("");
	let result: RunResult | null = $state(null);

	async function run(): Promise<void> {
		if (!selectedName || running) return;
		running = true;
		result = null;
		try {
			result = await callbacks.compile(project, selectedName, (i, total, name) => {
				progress = `Step ${i + 1} of ${total}: ${name}`;
			});
		} finally {
			running = false;
			progress = "";
		}
	}
</script>

<div class="novelr-compile">
	<div class="novelr-field">
		<div class="novelr-field-label">Workflow</div>
		<div class="novelr-inline">
			<select
				class="dropdown novelr-grow"
				value={selectedName ?? ""}
				onchange={(e) => callbacks.setWorkflow(project, (e.currentTarget as HTMLSelectElement).value || null)}
				aria-label="Workflow"
			>
				{#if workflows.length === 0}
					<option value="">No workflows</option>
				{/if}
				{#each workflows as w (w.name)}
					<option value={w.name}>{w.name}</option>
				{/each}
			</select>
			<button class="clickable-icon novelr-icon-button" aria-label="Edit workflows" use:icon={"settings-2"} onclick={() => callbacks.editWorkflows(project)}></button>
		</div>
		{#if selectedName}
			{@const selected = workflows.find((w) => w.name === selectedName)}
			{#if selected?.description}
				<p class="novelr-muted">{selected.description}</p>
			{/if}
		{/if}
	</div>

	{#if validation}
		{#each validation.errors as e, i (i)}
			<div class="novelr-callout novelr-callout-error">{e}</div>
		{/each}
		{#each validation.warnings as w, i (i)}
			<div class="novelr-callout novelr-callout-warning">{w}</div>
		{/each}
	{/if}

	<div class="novelr-inline">
		<button class="mod-cta" disabled={running || !selectedName || (validation?.errors.length ?? 0) > 0} onclick={() => void run()}>
			{running ? "Compiling…" : "Compile"}
		</button>
		{#if running}
			<span class="novelr-muted">{progress}</span>
		{/if}
	</div>

	{#if result}
		<div class="novelr-result" class:is-error={!result.ok}>
			{#if result.ok}
				{#if result.outputs["writtenPath"]}
					<div>
						Saved to
						<button class="novelr-link" onclick={() => callbacks.openPath(result?.outputs["writtenPath"] ?? "")}>{result.outputs["writtenPath"]}</button>
					</div>
				{:else}
					<div>Compiled ({result.output?.length ?? 0} characters), nothing was saved.</div>
				{/if}
			{:else}
				<div>Failed at step {(result.failedStep ?? 0) + 1}: {result.error}</div>
			{/if}
			<ul class="novelr-log">
				{#each result.log as entry, i (i)}
					<li class:is-failed={!result.ok && entry.stepIndex === result.failedStep}>
						<span class="novelr-log-name">{entry.stepIndex >= 0 ? `${entry.stepIndex + 1}. ` : ""}{entry.name}</span>
						{#if entry.stepIndex >= 0}
							<span class="novelr-row-type">{entry.ms} ms</span>
						{/if}
						{#if entry.messages.length > 0}
							<div class="novelr-log-messages">{entry.messages.join(" · ")}</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
