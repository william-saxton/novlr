<script lang="ts">
	import type { StepDescription, Workflow } from "../../compile/types";
	import { newWorkflowStep } from "../../compile/workflows";
	import type { Project } from "../../model/types";
	import { getCallbacks } from "../context";
	import StepCard from "./StepCard.svelte";

	let { project, workflow }: { project: Project; workflow: Workflow } = $props();
	const callbacks = getCallbacks();

	let descriptions = $derived(callbacks.listStepDescriptions());
	let groups = $derived([
		{ label: "Node steps", items: descriptions.filter((d) => d.kind === "node" && !d.isScript) },
		{ label: "Build", items: descriptions.filter((d) => d.kind === "join" && !d.isScript) },
		{ label: "Manuscript steps", items: descriptions.filter((d) => d.kind === "manuscript" && !d.isScript) },
		{ label: "Your scripts", items: descriptions.filter((d) => d.isScript) },
	]);

	let addChoice = $state("");

	function addStep(): void {
		const description = descriptions.find((d) => d.canonicalID === addChoice);
		addChoice = "";
		if (!description) return;
		const step = newWorkflowStep(description);
		// Put the new step in a sensible spot: node steps before the build step, manuscript steps after.
		const joinIndex = workflow.steps.findIndex((s) => callbacks.stepDescription(s.id)?.kind === "join");
		if (description.kind === "node" && joinIndex !== -1) workflow.steps.splice(joinIndex, 0, step);
		else workflow.steps.push(step);
		callbacks.workflowChanged();
	}

	function removeStep(index: number): void {
		workflow.steps.splice(index, 1);
		callbacks.workflowChanged();
	}

	function moveStep(index: number, delta: number): void {
		const j = index + delta;
		if (j < 0 || j >= workflow.steps.length) return;
		const [item] = workflow.steps.splice(index, 1);
		if (item) workflow.steps.splice(j, 0, item);
		callbacks.workflowChanged();
	}

	function descriptionFor(id: string): StepDescription | undefined {
		return callbacks.stepDescription(id);
	}
</script>

<div class="novelr-workflow-editor">
	<div class="novelr-inline">
		<span class="novelr-field-label novelr-inline-label">{workflow.name}</span>
		<span class="novelr-grow"></span>
		<button onclick={() => callbacks.renameWorkflow(project, workflow.name)}>Rename</button>
		<button onclick={() => callbacks.duplicateWorkflow(project, workflow.name)}>Duplicate</button>
		<button class="mod-warning" onclick={() => callbacks.deleteWorkflow(project, workflow.name)}>Delete</button>
	</div>

	<label class="novelr-field">
		<span class="novelr-field-label">Description</span>
		<input type="text" class="novelr-input" bind:value={workflow.description} onchange={() => callbacks.workflowChanged()} />
	</label>

	<div class="novelr-steps">
		{#each workflow.steps as step, i (step)}
			<StepCard
				{project}
				{step}
				index={i}
				description={descriptionFor(step.id)}
				onremove={() => removeStep(i)}
				onmoveup={() => moveStep(i, -1)}
				onmovedown={() => moveStep(i, 1)}
				onchange={() => callbacks.workflowChanged()}
			/>
		{/each}
	</div>

	<select class="dropdown" bind:value={addChoice} onchange={addStep} aria-label="Add step">
		<option value="">Add a step…</option>
		{#each groups as group (group.label)}
			{#if group.items.length > 0}
				<optgroup label={group.label}>
					{#each group.items as d (d.canonicalID)}
						<option value={d.canonicalID}>{d.name}</option>
					{/each}
				</optgroup>
			{/if}
		{/each}
	</select>
</div>
