<script lang="ts">
	import type { StepDescription, WorkflowStep } from "../../compile/types";
	import { optionsFor } from "../../compile/workflows";
	import type { Project } from "../../model/types";
	import { icon } from "../../utils/icons";
	import OptionEditor from "./OptionEditor.svelte";

	let {
		project,
		step,
		index,
		description,
		onremove,
		onmoveup,
		onmovedown,
		onchange,
	}: {
		project: Project;
		step: WorkflowStep;
		index: number;
		description: StepDescription | undefined;
		onremove: () => void;
		onmoveup: () => void;
		onmovedown: () => void;
		onchange: () => void;
	} = $props();

	let open = $state(false);
	let options = $derived(description ? optionsFor(description) : []);

	const kindLabel: Record<string, string> = { node: "nodes", tree: "structure", join: "build", manuscript: "manuscript" };

	let summary = $derived.by(() => {
		if (!description) return "";
		const parts: string[] = [];
		if (description.kind === "node") {
			const targets = step.optionValues["targets"];
			parts.push(Array.isArray(targets) && targets.length > 0 ? targets.join(", ") : "all nodes");
		}
		const text = step.optionValues["text"];
		if (typeof text === "string" && text.length > 0) parts.push(JSON.stringify(text.length > 30 ? text.slice(0, 30) + "…" : text));
		const path = step.optionValues["path"];
		if (typeof path === "string" && path.length > 0) parts.push(path);
		return parts.join(" · ");
	});
</script>

<div class="novelr-step" class:is-missing={!description}>
	<button class="novelr-step-header" onclick={() => (open = !open)}>
		<span class="novelr-chevron" class:is-collapsed={!open} use:icon={"chevron-down"}></span>
		<span class="novelr-step-index">{index + 1}</span>
		<span class="novelr-step-name">{description?.name ?? step.id}</span>
		{#if description}
			<span class="novelr-badge">{kindLabel[description.kind]}</span>
		{:else}
			<span class="novelr-badge is-error">missing</span>
		{/if}
		<span class="novelr-step-summary">{summary}</span>
	</button>

	{#if open}
		<div class="novelr-step-body">
			{#if description}
				<p class="novelr-muted">{description.description}</p>
				{#each options as option (option.id)}
					<OptionEditor {project} {option} values={step.optionValues} {onchange} />
				{/each}
			{:else}
				<p class="novelr-muted">This step is not available. Remove it or add the script that provides it.</p>
			{/if}
			<div class="novelr-inline">
				<button class="clickable-icon novelr-icon-button" aria-label="Move up" use:icon={"arrow-up"} onclick={onmoveup}></button>
				<button class="clickable-icon novelr-icon-button" aria-label="Move down" use:icon={"arrow-down"} onclick={onmovedown}></button>
				<span class="novelr-grow"></span>
				<button class="clickable-icon novelr-icon-button" aria-label="Remove step" use:icon={"trash"} onclick={onremove}></button>
			</div>
		</div>
	{/if}
</div>
