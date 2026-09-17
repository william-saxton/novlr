<script lang="ts">
	import type { Project } from "../../model/types";
	import { getCallbacks } from "../context";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();
</script>

<div class="novelr-project">
	<div class="novelr-field">
		<div class="novelr-field-label">Title</div>
		<div class="novelr-field-value">{project.title}</div>
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
		<div class="novelr-field-label">Workflow</div>
		<div class="novelr-field-value">{project.workflow ?? "None"}</div>
	</div>
	<div class="novelr-field">
		<div class="novelr-field-label">Schema</div>
		<ul class="novelr-type-list">
			{#each project.schema.types as t (t.id)}
				<li>
					<span class="novelr-type-name">{t.name}</span>
					<span class="novelr-row-type">{t.id}</span>
					<span class="novelr-row-type">{t.kind}</span>
					{#if t.id === project.schema.rootType}
						<span class="novelr-row-type">root</span>
					{/if}
					{#if t.allowedChildren && t.allowedChildren.length > 0}
						<span class="novelr-muted">holds {t.allowedChildren.join(", ")}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>
