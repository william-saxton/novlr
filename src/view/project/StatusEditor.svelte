<script lang="ts">
	import { slugify } from "../../model/schema";
	import { STATUS_COLORS, validateStatuses } from "../../model/status";
	import type { Project, StatusDef } from "../../model/types";
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
</script>

<div class="novelr-field novelr-schema">
	<button class="novelr-section-header novelr-schema-header" onclick={() => (open = !open)}>
		<span class="novelr-chevron" class:is-collapsed={!open} use:icon={"chevron-down"}></span>
		<span class="novelr-field-label novelr-inline-label">Statuses</span>
		<span class="novelr-count">{project.statuses.length}</span>
	</button>

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
							<span class="novelr-status-dot novelr-color-{d.color ?? 'none'}" class:is-unset={!d.color}></span>
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
											<button class="novelr-chip novelr-chip-color novelr-color-{c}" class:is-active={d.color === c} aria-label={c} title={c} onclick={() => (d.color = c)}></button>
										{/each}
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
