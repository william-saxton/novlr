<script lang="ts">
	import { slugify } from "../../model/schema";
	import { STATUS_COLORS, statusColorValue, validateStatuses } from "../../model/status";
	import type { Project, StatusDef } from "../../model/types";
	import { palette } from "../../store/workflows";
	import { deepEqual } from "../../utils/deepEqual";
	import { icon } from "../../utils/icons";
	import { getCallbacks } from "../context";

	let { project }: { project: Project } = $props();
	const callbacks = getCallbacks();

	interface Draft extends StatusDef {
		originalId: string;
		idTouched: boolean;
	}

	let draft: Draft[] = $state([]);
	let seededFrom: StatusDef[] | null = $state(null);
	let open = $state(false);
	let expanded: string | null = $state(null);

	function seed(): void {
		draft = project.statuses.map((s) => ({ ...s, originalId: s.id, idTouched: true }));
		seededFrom = project.statuses.map((s) => ({ ...s }));
	}

	$effect(() => {
		if (!seededFrom || !deepEqual(seededFrom, project.statuses)) seed();
	});

	let statuses: StatusDef[] = $derived(
		draft.map((d) => {
			const out: StatusDef = { id: d.id, name: d.name };
			if (d.color) out.color = d.color;
			if (d.parent) out.parent = d.parent;
			if (d.default) out.default = true;
			return out;
		}),
	);
	let renames: Record<string, string> = $derived(
		Object.fromEntries(draft.filter((d) => d.originalId && d.originalId !== d.id).map((d) => [d.originalId, d.id])),
	);
	let dirty = $derived(!deepEqual(statuses, project.statuses));
	let errors = $derived(dirty ? validateStatuses(statuses) : []);

	function add(): void {
		let id = "status";
		let n = 2;
		while (draft.some((d) => d.id === id)) id = `status-${n++}`;
		draft.push({ id, name: "New status", originalId: "", idTouched: false });
		expanded = id;
		open = true;
	}

	function remove(index: number): void {
		const removed = draft[index];
		draft.splice(index, 1);
		if (removed) for (const d of draft) if (d.parent === removed.id) delete d.parent;
	}

	function move(index: number, delta: number): void {
		const j = index + delta;
		if (j < 0 || j >= draft.length) return;
		const [item] = draft.splice(index, 1);
		if (item) draft.splice(j, 0, item);
	}

	function renameId(d: Draft, next: string): void {
		const old = d.id;
		d.id = next;
		if (old === next) return;
		for (const other of draft) if (other.parent === old) other.parent = next;
		if (expanded === old) expanded = next;
	}

	function onName(d: Draft): void {
		if (!d.idTouched) renameId(d, slugify(d.name));
	}

	function onId(d: Draft, e: Event): void {
		d.idTouched = true;
		renameId(d, (e.currentTarget as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
	}

	function setDefault(d: Draft, value: boolean): void {
		for (const other of draft) delete other.default;
		if (value) d.default = true;
	}

	function apply(): void {
		if (callbacks.setStatuses(project, statuses, renames).length === 0) seededFrom = null;
	}

	// ---- custom colors ------------------------------------------------------

	/** One hidden native color input shared by every picker interaction. */
	let colorInput: HTMLInputElement | undefined = $state();
	let onColorInput: (hex: string) => void = () => {};
	let onColorChange: (hex: string) => void = () => {};

	function openPicker(initial: string, live: (hex: string) => void, done: (hex: string) => void): void {
		if (!colorInput) return;
		onColorInput = live;
		onColorChange = done;
		colorInput.value = initial;
		colorInput.click();
	}

	function addColor(d: Draft): void {
		openPicker(
			hexOf(d.color),
			(hex) => (d.color = hex),
			(hex) => {
				d.color = hex;
				if (!$palette.includes(hex)) palette.update((list) => [...list, hex]);
			},
		);
	}

	function editColor(old: string): void {
		openPicker(
			old,
			(hex) => {
				for (const d of draft) if (d.color === old) d.color = hex;
			},
			(hex) => {
				for (const d of draft) if (d.color === old) d.color = hex;
				palette.update((list) => list.map((c) => (c === old ? hex : c)).filter((c, i, a) => a.indexOf(c) === i));
			},
		);
	}

	function removeColor(c: string): void {
		palette.update((list) => list.filter((x) => x !== c));
		for (const d of draft) if (d.color === c) delete d.color;
	}

	function swatchMenu(e: MouseEvent, c: string): void {
		e.preventDefault();
		callbacks.showMenu(e, [
			{ title: "Edit color…", icon: "palette", onClick: () => editColor(c) },
			{ title: "Remove color", icon: "trash", danger: true, onClick: () => removeColor(c) },
		]);
	}

	function hexOf(color: string | undefined): string {
		if (!color || !color.startsWith("#")) return "#888888";
		return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.slice(0, 7);
	}
</script>

<div class="novelr-field novelr-schema">
	<button class="novelr-section-header novelr-schema-header" onclick={() => (open = !open)}>
		<span class="novelr-chevron" class:is-collapsed={!open} use:icon={"chevron-down"}></span>
		<span class="novelr-field-label novelr-inline-label">Statuses</span>
		<span class="novelr-count">{project.statuses.length}</span>
	</button>

	<input
		type="color"
		class="novelr-hidden-color-input"
		aria-hidden="true"
		tabindex="-1"
		bind:this={colorInput}
		oninput={(e) => onColorInput((e.currentTarget as HTMLInputElement).value)}
		onchange={(e) => onColorChange((e.currentTarget as HTMLInputElement).value)}
	/>

	{#if open}
		<div class="novelr-schema-body">
			<div class="novelr-muted">
				A status can push another status onto the node that contains it. When several children push different statuses, the one listed first wins.
			</div>

			<div class="novelr-type-rows">
				{#each draft as d, i (d.originalId || `new-${i}`)}
					<div class="novelr-type-row" class:is-expanded={expanded === d.id}>
						<button class="novelr-type-summary" onclick={() => (expanded = expanded === d.id ? null : d.id)}>
							<span class="novelr-chevron" class:is-collapsed={expanded !== d.id} use:icon={"chevron-down"}></span>
							<span class="novelr-status-dot" style:--novelr-status-color={statusColorValue(d.color)} class:is-unset={!d.color}></span>
							<span class="novelr-type-name">{d.name || "Unnamed"}</span>
							<span class="novelr-row-type">{d.id}</span>
							{#if d.default}<span class="novelr-badge">default</span>{/if}
							{#if d.parent}<span class="novelr-muted">pushes {draft.find((x) => x.id === d.parent)?.name ?? d.parent} up</span>{/if}
						</button>
						{#if expanded === d.id}
							<div class="novelr-type-form">
								<label class="novelr-form-row">
									<span>Name</span>
									<input type="text" bind:value={d.name} oninput={() => onName(d)} />
								</label>
								<label class="novelr-form-row">
									<span>Id</span>
									<input type="text" value={d.id} oninput={(e) => onId(d, e)} />
								</label>
								<div class="novelr-form-row">
									<span>Color</span>
									<div class="novelr-chips">
										<button class="novelr-chip" class:is-active={!d.color} onclick={() => delete d.color}>None</button>
										{#each STATUS_COLORS as c (c)}
											<button
												class="novelr-chip-color"
												class:is-active={d.color === c}
												style:--novelr-status-color={statusColorValue(c)}
												aria-label={c}
												title="{c} (follows the theme)"
												onclick={() => (d.color = c)}
											></button>
										{/each}
										{#each $palette as c (c)}
											<button
												class="novelr-chip-color"
												class:is-active={d.color === c}
												style:--novelr-status-color={c}
												aria-label={c}
												title="{c} (right-click to edit or remove)"
												onclick={() => (d.color = c)}
												oncontextmenu={(e) => swatchMenu(e, c)}
											></button>
										{/each}
										<button class="novelr-color-add" aria-label="Add a color" title="Pick a new color" onclick={() => addColor(d)}>
											<span use:icon={"plus"}></span>
										</button>
									</div>
								</div>
								<label class="novelr-form-row">
									<span>Parent gets</span>
									<select class="dropdown" value={d.parent ?? ""} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) d.parent = v; else delete d.parent; }}>
										<option value="">Unchanged</option>
										{#each draft as other (other.originalId || other.id)}
											<option value={other.id}>{other.name || other.id}</option>
										{/each}
									</select>
								</label>
								<label class="novelr-form-row">
									<span>Default</span>
									<span class="novelr-option-row">
										<input type="checkbox" checked={d.default === true} onchange={(e) => setDefault(d, (e.currentTarget as HTMLInputElement).checked)} />
										<span class="novelr-muted">Given to nodes when they are created</span>
									</span>
								</label>
								<div class="novelr-inline">
									<button class="clickable-icon novelr-icon-button" aria-label="Move up" use:icon={"arrow-up"} onclick={() => move(i, -1)}></button>
									<button class="clickable-icon novelr-icon-button" aria-label="Move down" use:icon={"arrow-down"} onclick={() => move(i, 1)}></button>
									<span class="novelr-grow"></span>
									<button class="clickable-icon novelr-icon-button" aria-label="Remove status" use:icon={"trash"} onclick={() => remove(i)}></button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="novelr-inline">
				<button onclick={add}>Add status</button>
				<span class="novelr-grow"></span>
				{#if dirty}
					<button onclick={seed}>Revert</button>
					<button class="mod-cta" disabled={errors.length > 0} onclick={apply}>Apply</button>
				{/if}
			</div>

			{#each errors as e, i (i)}
				<div class="novelr-callout novelr-callout-error">{e}</div>
			{/each}
		</div>
	{/if}
</div>
