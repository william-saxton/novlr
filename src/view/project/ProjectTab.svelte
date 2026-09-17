<script lang="ts">
	import type { Project } from "../../model/types";
	import { workflows } from "../../store/workflows";
	import { getCallbacks } from "../context";
	import SchemaEditor from "./SchemaEditor.svelte";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	let title = $state("");
	let ignoreText = $state("");
	let lastIndexPath = $state("");

	// Re-seed the local inputs when a different project is shown or its saved values change.
	$effect(() => {
		if (project.indexPath !== lastIndexPath) {
			lastIndexPath = project.indexPath;
			title = project.title;
			ignoreText = project.ignore.join("\n");
		}
	});

	function commitTitle(): void {
		if (title.trim() && title.trim() !== project.title) callbacks.setTitle(project, title.trim());
		else title = project.title;
	}

	function commitIgnore(): void {
		const patterns = ignoreText.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
		if (patterns.join("\n") !== project.ignore.join("\n")) callbacks.setIgnore(project, patterns);
	}
</script>

<div class="novelr-project">
	<div class="novelr-field">
		<label class="novelr-field-label" for="novelr-title">Title</label>
		<input id="novelr-title" type="text" class="novelr-input" bind:value={title} onblur={commitTitle} onkeydown={(e) => e.key === "Enter" && commitTitle()} />
	</div>

	<div class="novelr-field">
		<div class="novelr-field-label">Root folder</div>
		<div class="novelr-field-value">{project.rootFolder || "/"}</div>
	</div>

	<div class="novelr-field">
		<div class="novelr-field-label">Index note</div>
		<button class="novelr-link" onclick={() => callbacks.openIndex(project)}>{project.indexPath}</button>
	</div>

	<div class="novelr-field">
		<label class="novelr-field-label" for="novelr-workflow">Compile workflow</label>
		<select
			id="novelr-workflow"
			class="dropdown"
			value={project.workflow ?? ""}
			onchange={(e) => callbacks.setWorkflow(project, (e.currentTarget as HTMLSelectElement).value || null)}
		>
			<option value="">Default</option>
			{#each $workflows as w (w.name)}
				<option value={w.name}>{w.name}</option>
			{/each}
		</select>
	</div>

	<div class="novelr-field">
		<label class="novelr-field-label" for="novelr-ignore">Ignored paths</label>
		<textarea id="novelr-ignore" class="novelr-textarea" rows="3" placeholder={"_notes/**\n*-scratch.md"} bind:value={ignoreText} onblur={commitIgnore}></textarea>
		<div class="novelr-muted">One glob per line, relative to the root folder. Matching files never show as unknown.</div>
	</div>

	<SchemaEditor {project} />

	<div class="novelr-field novelr-danger">
		<div class="novelr-field-label">Danger zone</div>
		<button onclick={() => callbacks.removeProject(project)}>Remove project from this note</button>
		<div class="novelr-muted">Deletes the novelr property from the index note. Files and folders are left untouched.</div>
	</div>
</div>
