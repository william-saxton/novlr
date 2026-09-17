<script lang="ts">
	import { slugify } from "../../model/schema";
	import type { NodeKind, NodeTypeDef } from "../../model/types";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";

	const callbacks = getCallbacks();

	/** Svelte action: wire the Obsidian icon autocomplete onto a text input. */
	function iconSuggest(el: HTMLInputElement, onPick: (id: string) => void): void {
		callbacks.attachIconSuggest(el, onPick);
	}

	interface DraftType extends NodeTypeDef {
		originalId: string;
		idTouched: boolean;
	}

	let {
		type = $bindable(),
		all,
		inUse = false,
		onremove,
		onmoveup,
		onmovedown,
		onidchange,
	}: {
		type: DraftType;
		all: DraftType[];
		inUse?: boolean;
		onremove: () => void;
		onmoveup: () => void;
		onmovedown: () => void;
		onidchange: (oldId: string, newId: string) => void;
	} = $props();

	let expanded = $state(type.originalId === "");

	function onNameInput(): void {
		if (!type.idTouched) {
			const next = slugify(type.name);
			if (next !== type.id) {
				const old = type.id;
				type.id = next;
				onidchange(old, next);
			}
		}
	}

	function onIdInput(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const old = type.id;
		const next = slugify(input.value) === input.value ? input.value : input.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
		type.idTouched = true;
		type.id = next;
		if (old !== next) onidchange(old, next);
	}

	function setKind(kind: NodeKind): void {
		type.kind = kind;
		if (kind === "content") type.allowedChildren = [];
	}

	function toggleChild(id: string): void {
		const list = type.allowedChildren ?? [];
		type.allowedChildren = list.includes(id) ? list.filter((c) => c !== id) : [...list, id];
	}

	let duplicateId = $derived(all.filter((t) => t.id === type.id).length > 1);
</script>

<div class="novelr-type-row" class:is-expanded={expanded}>
	<button class="novelr-type-summary" onclick={() => (expanded = !expanded)}>
		<span class="novelr-chevron" class:is-collapsed={!expanded} use:icon={"chevron-down"}></span>
		<span class="novelr-row-icon" use:icon={type.icon || (type.kind === "container" ? "folder" : "file-text")}></span>
		<span class="novelr-type-name">{type.name || "Unnamed"}</span>
		<span class="novelr-row-type" class:is-error={duplicateId}>{type.id}</span>
		<span class="novelr-row-type">{type.kind}</span>
		{#if type.kind === "container" && type.allowedChildren && type.allowedChildren.length > 0}
			<span class="novelr-muted">holds {type.allowedChildren.join(", ")}</span>
		{/if}
	</button>

	{#if expanded}
		<div class="novelr-type-form">
			<label class="novelr-form-row">
				<span>Name</span>
				<input type="text" bind:value={type.name} oninput={onNameInput} />
			</label>
			<label class="novelr-form-row">
				<span>Id</span>
				<input type="text" value={type.id} oninput={onIdInput} class:is-error={duplicateId} />
			</label>
			<div class="novelr-form-row">
				<span>Kind</span>
				<div class="novelr-segmented">
					<button class:is-active={type.kind === "container"} disabled={inUse && type.kind !== "container"} onclick={() => setKind("container")}>Container (folder)</button>
					<button class:is-active={type.kind === "content"} disabled={inUse && type.kind !== "content"} onclick={() => setKind("content")}>Content (note)</button>
				</div>
			</div>
			{#if type.kind === "container"}
				<div class="novelr-form-row">
					<span>Can hold</span>
					<div class="novelr-chips">
						{#each all.filter((t) => t.id !== "") as t (t.originalId || t.id)}
							<button class="novelr-chip" class:is-active={(type.allowedChildren ?? []).includes(t.id)} onclick={() => toggleChild(t.id)}>{t.name || t.id}</button>
						{/each}
					</div>
					<div class="novelr-muted">Nothing selected means any type.</div>
				</div>
			{/if}
			<label class="novelr-form-row">
				<span>Icon</span>
				<span class="novelr-icon-field">
					<span class="novelr-row-icon" use:icon={type.icon || (type.kind === "container" ? "folder" : "file-text")}></span>
					<input
						type="text"
						bind:value={type.icon}
						placeholder="Type to search icons…"
						use:iconSuggest={(id) => (type.icon = id)}
					/>
				</span>
			</label>
			<div class="novelr-inline">
				<button class="clickable-icon novelr-icon-button" aria-label="Move up" use:icon={"arrow-up"} onclick={onmoveup}></button>
				<button class="clickable-icon novelr-icon-button" aria-label="Move down" use:icon={"arrow-down"} onclick={onmovedown}></button>
				<span class="novelr-grow"></span>
				<button class="clickable-icon novelr-icon-button" aria-label="Remove type" use:icon={"trash"} disabled={inUse} onclick={onremove}></button>
			</div>
		</div>
	{/if}
</div>
