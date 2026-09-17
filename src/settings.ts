import {
	type App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import { get } from "svelte/store";
import type { Workflow } from "./compile/types";
import { DEFAULT_WORKFLOWS, cloneWorkflow, uniqueWorkflowName } from "./compile/workflows";
import type NovelrPlugin from "./main";
import { validateName } from "./model/paths";
import { validateSchema } from "./model/schema";
import type { SchemaPreset } from "./model/types";
import { deletePreset, presets, workflows } from "./store/workflows";

export interface NovelrSettings {
	/** Reusable schema presets offered when creating a project. */
	presets: SchemaPreset[];
	/** Vault-wide compile workflows; a project references one by name. */
	workflows: Workflow[];
	/** Text inserted for the {PB} placeholder. */
	pageBreak: string;
	/** Default basename (without .md) for new project index notes. */
	indexNoteName: string;
	/** Write `novelr-type` and `novelr-status` frontmatter into content files. */
	writeNodeType: boolean;
	/** Ask before trashing nodes. */
	confirmDelete: boolean;
	/** Set once the built-in workflows have been copied into `workflows`. */
	seededDefaults: boolean;
	/** Collapsed containers in the structure pane (`indexPath::nodePath`). */
	collapsed: string[];
	/** User-added hex colors offered as status swatches in every project. */
	customColors: string[];
}

export const DEFAULT_SETTINGS: NovelrSettings = {
	presets: [],
	workflows: [],
	pageBreak: '<div style="page-break-after: always;"></div>',
	indexNoteName: "novelr",
	writeNodeType: true,
	confirmDelete: true,
	seededDefaults: false,
	collapsed: [],
	customColors: [],
};

/**
 * Settings tab, rendered and indexed for search from `getSettingDefinitions()` (Obsidian 1.13+).
 */
export class NovelrSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: NovelrPlugin,
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Index note name",
				desc: "Basename used for the index note when creating a new project.",
				control: {
					type: "text",
					key: "indexNoteName",
					defaultValue: DEFAULT_SETTINGS.indexNoteName,
					validate: (v) => validateName(v.trim()) ?? undefined,
				},
			},
			{
				name: "Write node type and status to files",
				desc: "Keep novelr-type and novelr-status properties on content files in sync so other plugins can query them.",
				control: { type: "toggle", key: "writeNodeType", defaultValue: true },
			},
			{
				name: "Confirm before deleting",
				desc: "Show a confirmation dialog before moving nodes to the trash.",
				control: { type: "toggle", key: "confirmDelete", defaultValue: true },
			},
			{
				type: "group",
				heading: "Compile",
				items: [
					{
						name: "Page break text",
						desc: "Inserted wherever a compile step uses the {PB} placeholder.",
						control: { type: "text", key: "pageBreak", defaultValue: DEFAULT_SETTINGS.pageBreak },
					},
				],
			},
			{
				type: "list",
				heading: "Workflows",
				emptyState: "No workflows. Restore the built-in ones or create one in the compile tab of the structure pane.",
				extraButtons: [
					(b) => b.setIcon("upload").setTooltip("Export as JSON").onClick(() => this.exportWorkflows()),
					(b) => b.setIcon("download").setTooltip("Import JSON").onClick(() => this.openImportWorkflows()),
					(b) => b.setIcon("rotate-ccw").setTooltip("Restore built-in workflows").onClick(() => this.restoreBuiltinWorkflows()),
				],
				onDelete: (index) => {
					const w = get(workflows)[index];
					if (w) workflows.update((list) => list.filter((x) => x.name !== w.name));
					this.update();
				},
				items: get(workflows).map((w) => ({
					name: w.name,
					desc: describeWorkflow(w),
				})),
			},
			{
				type: "list",
				heading: "Structure presets",
				emptyState: "Save a project's schema as a preset from the project tab. The built-in presets are always available.",
				extraButtons: [
					(b) => b.setIcon("upload").setTooltip("Export as JSON").onClick(() => this.exportPresets()),
					(b) => b.setIcon("download").setTooltip("Import JSON").onClick(() => this.openImportPresets()),
				],
				onDelete: (index) => {
					const p = get(presets)[index];
					if (p) deletePreset(p.name);
					this.update();
				},
				items: get(presets).map((p) => ({
					name: p.name,
					desc: p.schema.types.map((t) => t.name).join(" › "),
				})),
			},
		];
	}

	// ---- shared actions -----------------------------------------------------

	private exportWorkflows(): void {
		new ExportJsonModal(this.app, "Export workflows", JSON.stringify(get(workflows), null, 2)).open();
	}

	private exportPresets(): void {
		new ExportJsonModal(this.app, "Export presets", JSON.stringify(get(presets), null, 2)).open();
	}

	private openImportWorkflows(): void {
		new ImportJsonModal(this.app, "Import workflows", (text) => this.importWorkflows(text)).open();
	}

	private openImportPresets(): void {
		new ImportJsonModal(this.app, "Import presets", (text) => this.importPresets(text)).open();
	}

	private restoreBuiltinWorkflows(): void {
		const names = get(workflows).map((w) => w.name);
		const restored = DEFAULT_WORKFLOWS.map((w) => ({ ...cloneWorkflow(w), name: uniqueWorkflowName(w.name, names) }));
		workflows.update((list) => [...list, ...restored]);
		new Notice(`Added ${restored.length} workflows.`);
		this.update();
	}

	private importWorkflows(text: string): string | null {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return "That is not valid JSON.";
		}
		const list = Array.isArray(parsed) ? parsed : [parsed];
		const imported: Workflow[] = [];
		for (const item of list) {
			if (typeof item !== "object" || item === null) return "Expected a workflow object or an array of them.";
			const w = item as Partial<Workflow>;
			if (typeof w.name !== "string" || !Array.isArray(w.steps)) return "Each workflow needs a name and a steps array.";
			const steps = w.steps.map((s) => {
				const raw = s as { id?: unknown; optionValues?: unknown };
				const values = raw.optionValues;
				return {
					id: typeof raw.id === "string" ? raw.id : "",
					optionValues: typeof values === "object" && values !== null ? (values as Record<string, unknown>) : {},
				};
			});
			imported.push({ name: w.name, description: typeof w.description === "string" ? w.description : "", steps });
		}
		workflows.update((current) => {
			const names = current.map((c) => c.name);
			const added = imported.map((w) => {
				const name = uniqueWorkflowName(w.name, names);
				names.push(name);
				return { ...w, name };
			});
			return [...current, ...added];
		});
		new Notice(`Imported ${imported.length} workflow${imported.length === 1 ? "" : "s"}.`);
		this.update();
		return null;
	}

	private importPresets(text: string): string | null {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return "That is not valid JSON.";
		}
		const list = Array.isArray(parsed) ? parsed : [parsed];
		const imported: SchemaPreset[] = [];
		for (const item of list) {
			const p = item as Partial<SchemaPreset>;
			if (typeof p !== "object" || p === null || typeof p.name !== "string" || typeof p.schema !== "object" || p.schema === null) {
				return "Each preset needs a name and a schema.";
			}
			const problems = validateSchema(p.schema);
			if (problems.length > 0) return `${p.name}: ${problems[0]}`;
			imported.push({ name: p.name, schema: p.schema });
		}
		presets.update((current) => [...current.filter((c) => !imported.some((i) => i.name === c.name)), ...imported]);
		new Notice(`Imported ${imported.length} preset${imported.length === 1 ? "" : "s"}.`);
		this.update();
		return null;
	}
}

function describeWorkflow(w: Workflow): string {
	return `${w.steps.length} step${w.steps.length === 1 ? "" : "s"}${w.description ? ` · ${w.description}` : ""}`;
}

/** Paste-a-blob-of-JSON modal. `onSubmit` returns an error message to keep the modal open. */
class ImportJsonModal extends Modal {
	private value = "";

	constructor(
		app: App,
		private readonly heading: string,
		private readonly onSubmit: (text: string) => string | null,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.heading);
		const textarea = this.contentEl.createEl("textarea", { cls: "novelr-import-textarea" });
		textarea.rows = 12;
		textarea.addEventListener("input", () => {
			this.value = textarea.value;
		});
		const error = this.contentEl.createDiv({ cls: "novelr-form-error" });
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText("Import")
				.setCta()
				.onClick(() => {
					const problem = this.onSubmit(this.value);
					if (problem) error.setText(problem);
					else this.close();
				}),
		);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

/** Shows JSON in a read-only, pre-selected textarea so the user can copy it themselves. */
class ExportJsonModal extends Modal {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly json: string,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.heading);
		this.contentEl.createEl("p", { text: "Select the text below and copy it.", cls: "novelr-muted" });
		const textarea = this.contentEl.createEl("textarea", { cls: "novelr-import-textarea" });
		textarea.rows = 14;
		textarea.readOnly = true;
		textarea.value = this.json;
		window.setTimeout(() => {
			textarea.focus();
			textarea.select();
		}, 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
