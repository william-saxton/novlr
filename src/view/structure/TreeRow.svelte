<script lang="ts">
	import type { Project } from "../../model/types";
	import { activeFilePath } from "../../store/ui";
	import { join } from "../../model/paths";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";
	import type { Row } from "./flatten";

	let { row, project, ontoggle }: { row: Row; project: Project; ontoggle: () => void } = $props();
	const callbacks = getCallbacks();

	let vaultPath = $derived(join(project.rootFolder, row.node.path));
	let isActive = $derived(row.node.kind === "content" && $activeFilePath === vaultPath);

	function onClick(): void {
		if (row.node.kind === "content") callbacks.openNode(project, row.node);
		else ontoggle();
	}

	function onKey(e: KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	}
</script>

<li
	class="novelr-row"
	class:is-active={isActive}
	class:is-missing={row.missing}
	class:is-unknown-type={row.unknownType}
	class:is-container={row.node.kind === "container"}
	style:--novelr-depth={row.depth}
	role="treeitem"
	aria-selected={isActive}
	aria-expanded={row.node.kind === "container" ? !row.collapsed : undefined}
	tabindex="0"
	data-path={row.node.path}
	onclick={onClick}
	onkeydown={onKey}
	oncontextmenu={(e) => {
		e.preventDefault();
		callbacks.showNodeMenu(project, row.node, e);
	}}
>
	<span class="novelr-row-indent"></span>
	{#if row.node.kind === "container"}
		<span
			class="novelr-chevron"
			class:is-collapsed={row.collapsed}
			class:is-empty={!row.hasChildren}
			use:icon={"chevron-down"}
			role="button"
			tabindex="-1"
			aria-label={row.collapsed ? "Expand" : "Collapse"}
			onclick={(e) => {
				e.stopPropagation();
				ontoggle();
			}}
			onkeydown={(e) => {
				if (e.key === "Enter") {
					e.stopPropagation();
					ontoggle();
				}
			}}
		></span>
	{:else}
		<span class="novelr-chevron is-empty"></span>
	{/if}
	<span class="novelr-row-icon" use:icon={row.icon}></span>
	<span class="novelr-row-title">{row.node.name}</span>
	{#if row.missing}
		<span class="novelr-row-badge" title="Not found on disk" use:icon={"alert-triangle"}></span>
	{:else if row.unknownType}
		<span class="novelr-row-badge" title={`Unknown type "${row.node.typeId}"`} use:icon={"help-circle"}></span>
	{/if}
	<span class="novelr-row-type">{row.node.typeId}</span>
</li>
