<script lang="ts">
	import { untrack } from "svelte";
	import type { StepDescription, Workflow } from "../../compile/types";
	import { cloneWorkflow, newWorkflowStep } from "../../compile/workflows";
	import type { Project } from "../../model/types";
	import { deepEqual } from "../../utils/deepEqual";
	import { getCallbacks } from "../context";
	import StepCard from "./StepCard.svelte";

	let { project, workflow }: { project: Project; workflow: Workflow } = $props();
	const callbacks = getCallbacks();

	// The store holds plain objects, which Svelte cannot observe, so the editor works on a
	// reactive copy and writes it back after every change. The copy is reseeded only when
	// the stored workflow differs from it (another workflow selected, renamed, or edited elsewhere).
	let draft: Workflow = $state(untrack(() => cloneWorkflow(workflow)));

	$effect(() => {
		if (!deepEqual($state.snapshot(draft), workflow)) draft = cloneWorkflow(workflow);
	});

	function save(): void {
		callbacks.saveWorkflow($state.snapshot(draft) as Workflow);
	}

	let descriptions = $derived(callbacks.listStepDescriptions());
	let groups = $derived([
		{ label: "Node steps", items: descriptions.filter((d) => d.kind === "node" && !d.external) },
		{ label: "Structure steps", items: descriptions.filter((d) => d.kind === "tree" && !d.external) },
		{ label: "Build", items: descriptions.filter((d) => d.kind === "join" && !d.external) },
		{ label: "Manuscript steps", items: descriptions.filter((d) => d.kind === "manuscript" && !d.external) },
		{ label: "From other plugins", items: descriptions.filter((d) => d.external) },
	]);

	let addChoice = $state("");

	function addStep(): void {
		const description = descriptions.find((d) => d.canonicalID === addChoice);
		addChoice = "";
		if (!description) return;
		const step = newWorkflowStep(description);
		// Put the new step in a sensible spot: structure steps before the build step, manuscript steps after.
		const joinIndex = draft.steps.findIndex((s) => callbacks.stepDescription(s.id)?.kind === "join");
		if ((description.kind === "node" || description.kind === "tree") && joinIndex !== -1) draft.steps.splice(joinIndex, 0, step);
		else draft.steps.push(step);
		save();
	}

	function removeStep(index: number): void {
		draft.steps.splice(index, 1);
		save();
	}

	function moveStep(index: number, delta: number): void {
		const j = index + delta;
		if (j < 0 || j >= draft.steps.length) return;
		const [item] = draft.steps.splice(index, 1);
		if (item) draft.steps.splice(j, 0, item);
		save();
	}

	function descriptionFor(id: string): StepDescription | undefined {
		return callbacks.stepDescription(id);
	}
</script>

<div class="novelr-workflow-editor">
	<div class="novelr-inline">
		<span class="novelr-field-label novelr-inline-label">{draft.name}</span>
		<span class="novelr-grow"></span>
		<button onclick={() => callbacks.renameWorkflow(project, draft.name)}>Rename</button>
		<button onclick={() => callbacks.duplicateWorkflow(project, draft.name)}>Duplicate</button>
		<button class="mod-warning" onclick={() => callbacks.deleteWorkflow(project, draft.name)}>Delete</button>
	</div>

	<label class="novelr-field">
		<span class="novelr-field-label">Description</span>
		<input type="text" class="novelr-input" bind:value={draft.description} onchange={save} />
	</label>

	<div class="novelr-steps">
		{#each draft.steps as step, i (step)}
			<StepCard
				{project}
				{step}
				index={i}
				description={descriptionFor(step.id)}
				onremove={() => removeStep(i)}
				onmoveup={() => moveStep(i, -1)}
				onmovedown={() => moveStep(i, 1)}
				onchange={save}
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
