<script lang="ts">
	import type { Project } from "../../model/types";
	import { collapsed, revealPath, toggleCollapsed } from "../../store/ui";
	import { scriptErrors } from "../../compile/userScripts";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";
	import { DragController, type DragIndicator } from "./dragController";
	import { flatten } from "./flatten";
	import TreeRow from "./TreeRow.svelte";
	import UnknownFiles from "./UnknownFiles.svelte";

	const INDENT_PX = 18;
	const BASE_INDENT_PX = 8;

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	let rows = $derived(flatten(project, $collapsed));
	let listEl: HTMLUListElement | undefined = $state();
	let indicator: DragIndicator | null = $state(null);
	let draggingPath: string | null = $state(null);

	$effect(() => {
		if (!listEl) return;
		const controller = new DragController({
			listEl,
			rowSelector: ".novelr-row",
			indentPx: INDENT_PX,
			baseIndentPx: BASE_INDENT_PX,
			getRows: () => rows,
			getSchema: () => project.schema,
			getRootTypeId: () => project.root.typeId,
			onIndicator: (i) => (indicator = i),
			onDragState: (path) => (draggingPath = path),
			onDrop: (target, dragged) => {
				callbacks.moveNode(project, dragged.node.path, target.parentPath, target.index);
			},
		});
		return () => controller.destroy();
	});

	// Scroll to and focus a row when a command asks for it.
	$effect(() => {
		const path = $revealPath;
		if (!path || !listEl) return;
		const el = listEl.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
		if (el) {
			el.scrollIntoView({ block: "nearest" });
			el.focus();
		}
		revealPath.set(null);
	});
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
	{#if $scriptErrors.size > 0}
		<div class="novelr-callout novelr-callout-error">
			{#each [...$scriptErrors] as [path, message] (path)}
				<div>{path}: {message}</div>
			{/each}
		</div>
	{/if}

	{#if rows.length === 0}
		<div class="novelr-empty">
			<p class="novelr-muted">This project has no nodes yet.</p>
			<button onclick={() => callbacks.newNode(project, project.root)}>Add the first node</button>
		</div>
	{:else}
		<ul class="novelr-tree" class:is-dragging={draggingPath !== null} role="tree" bind:this={listEl}>
			{#each rows as row (row.node.path)}
				<TreeRow
					{row}
					{project}
					dragging={draggingPath === row.node.path}
					ontoggle={() => toggleCollapsed(project.indexPath, row.node.path)}
				/>
			{/each}
			{#if indicator}
				<div
					class="novelr-drop-indicator"
					class:is-invalid={!indicator.valid}
					style:top={`${indicator.top}px`}
					style:--novelr-depth={indicator.depth}
				></div>
			{/if}
		</ul>
	{/if}

	<UnknownFiles {project} />
</div>
