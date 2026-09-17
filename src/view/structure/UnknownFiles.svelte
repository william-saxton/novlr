<script lang="ts">
	import type { Project } from "../../model/types";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();
	let open = $state(true);
</script>

{#if project.unknown.length > 0 || project.missing.length > 0}
	<div class="novelr-section">
		<button class="novelr-section-header" onclick={() => (open = !open)}>
			<span class="novelr-chevron" class:is-collapsed={!open} use:icon={"chevron-down"}></span>
			<span>Needs attention</span>
			<span class="novelr-count">{project.unknown.length + project.missing.length}</span>
		</button>
		{#if open}
			<ul class="novelr-attention">
				{#each project.unknown as entry (entry.path)}
					<li class="novelr-attention-row">
						<span class="novelr-row-icon" use:icon={entry.isFolder ? "folder" : "file"}></span>
						<span class="novelr-row-title" title={entry.path}>{entry.path}</span>
						<span class="novelr-row-type">not in index</span>
						<button class="clickable-icon novelr-icon-button" aria-label="Add to structure" use:icon={"plus"} onclick={() => callbacks.addUnknown(project, entry)}></button>
						<button class="clickable-icon novelr-icon-button" aria-label="Ignore" use:icon={"eye-off"} onclick={() => callbacks.ignoreUnknown(project, entry)}></button>
					</li>
				{/each}
				{#each project.missing as path (path)}
					<li class="novelr-attention-row is-missing">
						<span class="novelr-row-icon" use:icon={"alert-triangle"}></span>
						<span class="novelr-row-title" title={path}>{path}</span>
						<span class="novelr-row-type">missing on disk</span>
						<button class="clickable-icon novelr-icon-button" aria-label="Remove from index" use:icon={"x"} onclick={() => callbacks.removeMissing(project, path)}></button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
