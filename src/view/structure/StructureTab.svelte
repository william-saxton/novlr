<script lang="ts">
	import type { Project } from "../../model/types";
	import { collapsed, toggleCollapsed } from "../../store/ui";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";
	import { flatten } from "./flatten";
	import TreeRow from "./TreeRow.svelte";
	import UnknownFiles from "./UnknownFiles.svelte";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	let rows = $derived(flatten(project, $collapsed));
</script>

<div class="novelr-structure">
	<div class="novelr-toolbar">
		<span class="novelr-toolbar-title" title={project.rootFolder || "/"}>{project.title}</span>
		<button
			class="clickable-icon novelr-icon-button"
			aria-label="New node"
			use:icon={"file-plus"}
			onclick={() => callbacks.newNode(project, project.root)}
		></button>
	</div>

	{#if project.warnings.length > 0}
		<div class="novelr-callout novelr-callout-warning">
			{#each project.warnings as warning, i (i)}
				<div>{warning}</div>
			{/each}
		</div>
	{/if}

	{#if rows.length === 0}
		<div class="novelr-empty">
			<p class="novelr-muted">This project has no nodes yet.</p>
		</div>
	{:else}
		<ul class="novelr-tree" role="tree">
			{#each rows as row (row.node.path)}
				<TreeRow
					{row}
					{project}
					ontoggle={() => toggleCollapsed(project.indexPath, row.node.path)}
				/>
			{/each}
		</ul>
	{/if}

	<UnknownFiles {project} />
</div>
