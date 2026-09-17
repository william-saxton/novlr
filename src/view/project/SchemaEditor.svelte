<script lang="ts">
	import { cloneSchema, slugify, validateSchema } from "../../model/schema";
	import { checkSchemaChange } from "../../model/schemaOps";
	import type { NodeTypeDef, Project, Schema } from "../../model/types";
	import { deepEqual } from "../../utils/deepEqual";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";
	import TypeRow from "./TypeRow.svelte";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	interface DraftType extends NodeTypeDef {
		/** Id when the draft was seeded; "" for newly added types. */
		originalId: string;
		/** True once the user typed into the id field, which stops auto-slugging. */
		idTouched: boolean;
	}

	let draft: DraftType[] = $state([]);
	let rootType = $state("");
	let seededFrom: Schema | null = $state(null);
	let open = $state(false);

	function seed(): void {
		draft = project.schema.types.map((t) => ({
			...t,
			allowedChildren: t.allowedChildren ? [...t.allowedChildren] : [],
			originalId: t.id,
			idTouched: true,
		}));
		rootType = project.schema.rootType;
		seededFrom = cloneSchema(project.schema);
	}

	// Reseed whenever the saved schema changes underneath us (preset load, hand edit, other project).
	$effect(() => {
		if (!seededFrom || !deepEqual(seededFrom, project.schema)) seed();
	});

	let schema: Schema = $derived({
		rootType,
		types: draft.map((t) => {
			const out: NodeTypeDef = { id: t.id, name: t.name, kind: t.kind };
			if (t.kind === "container" && t.allowedChildren && t.allowedChildren.length > 0) out.allowedChildren = [...t.allowedChildren];
			if (t.icon) out.icon = t.icon;
			return out;
		}),
	});
	let renames: Record<string, string> = $derived(
		Object.fromEntries(draft.filter((t) => t.originalId && t.originalId !== t.id).map((t) => [t.originalId, t.id])),
	);
	let dirty = $derived(!deepEqual(schema, project.schema));
	let errors = $derived(dirty ? [...validateSchema(schema), ...checkSchemaChange(project, schema, renames).filter((e) => !validateSchema(schema).includes(e))] : []);

	function addType(): void {
		const base = "New type";
		let id = slugify(base);
		let n = 2;
		while (draft.some((t) => t.id === id)) id = `${slugify(base)}-${n++}`;
		draft.push({ id, name: base, kind: "content", allowedChildren: [], originalId: "", idTouched: false });
		open = true;
	}

	function removeType(index: number): void {
		const removed = draft[index];
		draft.splice(index, 1);
		if (removed) {
			for (const t of draft) t.allowedChildren = (t.allowedChildren ?? []).filter((c) => c !== removed.id);
			if (rootType === removed.id) rootType = draft.find((t) => t.kind === "container")?.id ?? "";
		}
	}

	function moveType(index: number, delta: number): void {
		const j = index + delta;
		if (j < 0 || j >= draft.length) return;
		const [item] = draft.splice(index, 1);
		if (item) draft.splice(j, 0, item);
	}

	function onIdRenamed(oldId: string, newId: string): void {
		for (const t of draft) t.allowedChildren = (t.allowedChildren ?? []).map((c) => (c === oldId ? newId : c));
		if (rootType === oldId) rootType = newId;
	}

	function apply(): void {
		const problems = callbacks.setSchema(project, schema, renames);
		if (problems.length === 0) seededFrom = null; // force reseed from the saved schema
	}

	function revert(): void {
		seed();
	}

	let presets = $derived(callbacks.listPresets());
	let presetChoice = $state("");

	function loadPreset(): void {
		const preset = presets.find((p) => p.name === presetChoice);
		presetChoice = "";
		if (preset) callbacks.loadPreset(project, preset);
	}
</script>

<div class="novelr-field novelr-schema">
	<button class="novelr-section-header novelr-schema-header" onclick={() => (open = !open)}>
		<span class="novelr-chevron" class:is-collapsed={!open} use:icon={"chevron-down"}></span>
		<span class="novelr-field-label novelr-inline-label">Structure schema</span>
		<span class="novelr-count">{project.schema.types.length}</span>
	</button>

	{#if open}
		<div class="novelr-schema-body">
			<div class="novelr-field">
				<label class="novelr-field-label" for="novelr-root-type">Root type</label>
				<select id="novelr-root-type" class="dropdown" bind:value={rootType}>
					{#each draft.filter((t) => t.kind === "container") as t (t.originalId || t.id)}
						<option value={t.id}>{t.name || t.id}</option>
					{/each}
				</select>
				<div class="novelr-muted">The type of the project's root folder.</div>
			</div>

			<div class="novelr-type-rows">
				{#each draft as t, i (t.originalId || `new-${i}`)}
					<TypeRow
						bind:type={draft[i]!}
						all={draft}
						inUse={project.root.typeId === t.originalId || (t.originalId !== "" && t.originalId === project.root.typeId)}
						onremove={() => removeType(i)}
						onmoveup={() => moveType(i, -1)}
						onmovedown={() => moveType(i, 1)}
						onidchange={(oldId, newId) => onIdRenamed(oldId, newId)}
					/>
				{/each}
			</div>

			<div class="novelr-inline">
				<button onclick={addType}>Add type</button>
				<span class="novelr-grow"></span>
				{#if dirty}
					<button onclick={revert}>Revert</button>
					<button class="mod-cta" disabled={errors.length > 0} onclick={apply}>Apply</button>
				{/if}
			</div>

			{#each errors as e, i (i)}
				<div class="novelr-callout novelr-callout-error">{e}</div>
			{/each}

			<div class="novelr-field">
				<div class="novelr-field-label">Presets</div>
				<div class="novelr-inline">
					<select class="dropdown novelr-grow" bind:value={presetChoice} onchange={loadPreset} aria-label="Load preset">
						<option value="">Load a preset…</option>
						{#each presets as p (p.name)}
							<option value={p.name}>{p.name}</option>
						{/each}
					</select>
					<button onclick={() => callbacks.savePreset(project)}>Save as preset</button>
				</div>
				<div class="novelr-muted">Loading a preset replaces this project's schema. It is refused if nodes use types the preset lacks.</div>
			</div>
		</div>
	{/if}
</div>
