<script lang="ts">
	import { currentProject, projectList, selectedIndexPath } from "../store/projects";
	import { activeTab, type Tab } from "../store/ui";
	import { icon } from "../utils/icons";
	import { getCallbacks } from "./context";
	import StructureTab from "./structure/StructureTab.svelte";
	import ProjectTab from "./project/ProjectTab.svelte";
	import CompileTab from "./compile/CompileTab.svelte";

	const callbacks = getCallbacks();
	const tabs: { id: Tab; label: string }[] = [
		{ id: "structure", label: "Structure" },
		{ id: "project", label: "Project" },
		{ id: "compile", label: "Compile" },
	];
</script>

<div class="novelr-app">
	<header class="novelr-header">
		<select
			class="dropdown novelr-project-select"
			value={$selectedIndexPath ?? ""}
			onchange={(e) => selectedIndexPath.set((e.currentTarget as HTMLSelectElement).value || null)}
			aria-label="Project"
		>
			{#if $projectList.length === 0}
				<option value="">No projects</option>
			{/if}
			{#each $projectList as p (p.indexPath)}
				<option value={p.indexPath}>{p.title}</option>
			{/each}
		</select>
		<button class="clickable-icon novelr-icon-button" aria-label="New project" use:icon={"plus"} onclick={() => callbacks.newProject()}></button>
	</header>

	{#if $currentProject}
		<nav class="novelr-tabs">
			{#each tabs as tab (tab.id)}
				<button
					class="novelr-tab"
					class:is-active={$activeTab === tab.id}
					onclick={() => activeTab.set(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
		<div class="novelr-tab-body">
			{#if $activeTab === "structure"}
				<StructureTab project={$currentProject} />
			{:else if $activeTab === "project"}
				<ProjectTab project={$currentProject} />
			{:else}
				<CompileTab project={$currentProject} />
			{/if}
		</div>
	{:else}
		<div class="novelr-empty">
			<p>No project selected.</p>
			<button class="mod-cta" onclick={() => callbacks.newProject()}>Create a project</button>
		</div>
	{/if}
</div>
