<script lang="ts">
	import type { Project } from "../../model/types";

	let { project, selected, onchange }: { project: Project; selected: string[]; onchange: (next: string[]) => void } = $props();

	let extra = $derived(selected.filter((id) => !project.schema.types.some((t) => t.id === id)));
	let custom = $state("");

	function toggle(id: string): void {
		onchange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
	}

	function addCustom(): void {
		const id = custom.trim().toLowerCase();
		custom = "";
		if (id && !selected.includes(id)) onchange([...selected, id]);
	}
</script>

<div class="novelr-chips">
	<button class="novelr-chip" class:is-active={selected.length === 0} onclick={() => onchange([])}>All</button>
	{#each project.schema.types as t (t.id)}
		<button class="novelr-chip" class:is-active={selected.includes(t.id)} onclick={() => toggle(t.id)}>{t.name}</button>
	{/each}
	{#each extra as id (id)}
		<button class="novelr-chip is-active is-foreign" title="Not in this project's schema" onclick={() => toggle(id)}>{id}</button>
	{/each}
	<input
		type="text"
		class="novelr-chip-input"
		placeholder="other type id…"
		bind:value={custom}
		onkeydown={(e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addCustom();
			}
		}}
		onblur={addCustom}
	/>
</div>
