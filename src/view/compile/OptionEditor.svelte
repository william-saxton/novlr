<script lang="ts">
	import type { StepOption } from "../../compile/types";
	import { statusColorValue } from "../../model/status";
	import type { Project } from "../../model/types";
	import NodeTypePicker from "./NodeTypePicker.svelte";

	let {
		project,
		option,
		values,
		onchange,
	}: { project: Project; option: StepOption; values: Record<string, unknown>; onchange: () => void } = $props();

	const PLACEHOLDER_HELP = [
		"{title} {number} {number:word} {number:Word} {number:roman} {number:Roman} {number:pad2}",
		"{index} {count} {absolute} {depth} {type}",
		"{parent.title} {parent.number} {chapter.title} {chapter.number} (any type id)",
		"{project.title} {date} {BR} line break, {PB} page break, ---- horizontal rule",
	].join("\n");

	function set(value: unknown): void {
		values[option.id] = value;
		onchange();
	}

	function stringValue(): string {
		const v = values[option.id];
		return typeof v === "string" ? v : String(option.default ?? "");
	}
</script>

<div class="novelr-option">
	{#if option.type === "boolean"}
		<label class="novelr-option-row">
			<input type="checkbox" checked={values[option.id] === true} onchange={(e) => set((e.currentTarget as HTMLInputElement).checked)} />
			<span class="novelr-option-name">{option.name}</span>
		</label>
		<div class="novelr-muted">{option.description}</div>
	{:else if option.type === "text"}
		<label class="novelr-option-col">
			<span class="novelr-option-name">
				{option.name}
				{#if option.placeholders}<span class="novelr-help" title={PLACEHOLDER_HELP}>?</span>{/if}
			</span>
			<input type="text" value={stringValue()} onchange={(e) => set((e.currentTarget as HTMLInputElement).value)} />
		</label>
		<div class="novelr-muted">{option.description}</div>
	{:else if option.type === "multiline-text"}
		<label class="novelr-option-col">
			<span class="novelr-option-name">
				{option.name}
				{#if option.placeholders}<span class="novelr-help" title={PLACEHOLDER_HELP}>?</span>{/if}
			</span>
			<textarea class="novelr-textarea" rows="2" value={stringValue()} onchange={(e) => set((e.currentTarget as HTMLTextAreaElement).value)}></textarea>
		</label>
		<div class="novelr-muted">{option.description}</div>
	{:else if option.type === "select"}
		<label class="novelr-option-col">
			<span class="novelr-option-name">{option.name}</span>
			<select class="dropdown" value={stringValue()} onchange={(e) => set((e.currentTarget as HTMLSelectElement).value)}>
				{#each option.choices as c (c.value)}
					<option value={c.value}>{c.label}</option>
				{/each}
			</select>
		</label>
		<div class="novelr-muted">{option.description}</div>
	{:else if option.type === "node-types"}
		<div class="novelr-option-col">
			<span class="novelr-option-name">{option.name}</span>
			<NodeTypePicker {project} selected={Array.isArray(values[option.id]) ? (values[option.id] as string[]) : []} onchange={(next) => set(next)} />
		</div>
		<div class="novelr-muted">{option.description}</div>
	{:else if option.type === "statuses"}
		{@const selected = Array.isArray(values[option.id]) ? (values[option.id] as string[]) : []}
		<div class="novelr-option-col">
			<span class="novelr-option-name">{option.name}</span>
			<div class="novelr-chips">
				{#each project.statuses as s (s.id)}
					<button
						class="novelr-chip"
						class:is-active={selected.includes(s.id)}
						onclick={() => set(selected.includes(s.id) ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
					>
						<span class="novelr-status-dot" style:--novelr-status-color={statusColorValue(s.color)} class:is-unset={!s.color}></span>
						{s.name}
					</button>
				{/each}
				<button class="novelr-chip" class:is-active={selected.includes("")} onclick={() => set(selected.includes("") ? selected.filter((x) => x !== "") : [...selected, ""])}>No status</button>
			</div>
		</div>
		<div class="novelr-muted">{option.description}</div>
	{/if}
</div>
