import { type App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { get } from "svelte/store";
import type { Workflow } from "./compile/types";
import { DEFAULT_WORKFLOWS, cloneWorkflow, uniqueWorkflowName } from "./compile/workflows";
import type NovelrPlugin from "./main";
import { FolderSuggest } from "./modals/FolderSuggest";
import { validateSchema } from "./model/schema";
import type { SchemaPreset } from "./model/types";
import { deletePreset, presets, workflows } from "./store/workflows";

export interface NovelrSettings {
	/** Reusable schema presets offered when creating a project. */
	presets: SchemaPreset[];
	/** Vault-wide compile workflows; a project references one by name. */
	workflows: Workflow[];
	/** Vault folder containing user-provided .js compile steps. Empty = disabled. */
	userScriptFolder: string;
	/** Text inserted for the {PB} placeholder. */
	pageBreak: string;
	/** Default basename (without .md) for new project index notes. */
	indexNoteName: string;
	/** Write `novelr-type` frontmatter into newly created content files. */
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
	userScriptFolder: "",
	pageBreak: '<div style="page-break-after: always;"></div>',
	indexNoteName: "novelr",
	writeNodeType: true,
	confirmDelete: true,
	seededDefaults: false,
	collapsed: [],
	customColors: [],
};

export class NovelrSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: NovelrPlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Index note name")
			.setDesc("Basename used for the index note when creating a new project.")
			.addText((text) =>
				text.setValue(this.plugin.settings.indexNoteName).onChange(async (value) => {
					this.plugin.settings.indexNoteName = value.trim() || DEFAULT_SETTINGS.indexNoteName;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Write node type and status to files")
			.setDesc("Keep novelr-type and novelr-status properties on content files in sync so other plugins can query them.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.writeNodeType).onChange(async (value) => {
					this.plugin.settings.writeNodeType = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Confirm before deleting")
			.setDesc("Show a confirmation dialog before moving nodes to the trash.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.confirmDelete).onChange(async (value) => {
					this.plugin.settings.confirmDelete = value;
					await this.plugin.saveSettings();
				}),
			);

		this.displayCompile(containerEl);
		this.displayWorkflows(containerEl);
		this.displayPresets(containerEl);
	}

	private displayCompile(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Compile").setHeading();

		new Setting(containerEl)
			.setName("User script folder")
			.setDesc("Vault folder containing .js files that define custom compile steps. Leave empty to disable.")
			.addText((text) => {
				text.setValue(this.plugin.settings.userScriptFolder).onChange(async (value) => {
					this.plugin.settings.userScriptFolder = value.trim();
					await this.plugin.saveSettings();
					await this.plugin.scripts.reloadAll();
				});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName("Page break text")
			.setDesc("Inserted wherever a compile step uses the {PB} placeholder.")
			.addText((text) =>
				text.setValue(this.plugin.settings.pageBreak).onChange(async (value) => {
					this.plugin.settings.pageBreak = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private displayWorkflows(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Workflows").setHeading();

		new Setting(containerEl)
			.setName("Export and import")
			.setDesc("Workflows are edited in the compile tab of the structure pane. Export them as JSON to share or back up.")
			.addButton((button) =>
				button.setButtonText("Copy as JSON").onClick(async () => {
					await navigator.clipboard.writeText(JSON.stringify(get(workflows), null, 2));
					new Notice("Workflows copied to the clipboard.");
				}),
			)
			.addButton((button) =>
				button.setButtonText("Import JSON").onClick(() => {
					new ImportJsonModal(this.app, "Import workflows", (text) => this.importWorkflows(text)).open();
				}),
			)
			.addButton((button) =>
				button.setButtonText("Restore built-in").onClick(() => {
					const names = get(workflows).map((w) => w.name);
					const restored = DEFAULT_WORKFLOWS.map((w) => ({ ...cloneWorkflow(w), name: uniqueWorkflowName(w.name, names) }));
					workflows.update((list) => [...list, ...restored]);
					new Notice(`Added ${restored.length} workflows.`);
					this.display();
				}),
			);

		for (const w of get(workflows)) {
			new Setting(containerEl)
				.setName(w.name)
				.setDesc(`${w.steps.length} step${w.steps.length === 1 ? "" : "s"}${w.description ? ` · ${w.description}` : ""}`)
				.addButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Delete workflow")
						.onClick(() => {
							workflows.update((list) => list.filter((x) => x.name !== w.name));
							this.display();
						}),
				);
		}
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
		this.display();
		return null;
	}

	private displayPresets(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Structure presets").setHeading();

		new Setting(containerEl)
			.setName("Saved presets")
			.setDesc("Save a project's schema as a preset from the project tab. The built-in presets are always available.")
			.addButton((button) =>
				button.setButtonText("Copy as JSON").onClick(async () => {
					await navigator.clipboard.writeText(JSON.stringify(get(presets), null, 2));
					new Notice("Presets copied to the clipboard.");
				}),
			)
			.addButton((button) =>
				button.setButtonText("Import JSON").onClick(() => {
					new ImportJsonModal(this.app, "Import presets", (text) => this.importPresets(text)).open();
				}),
			);

		for (const p of get(presets)) {
			new Setting(containerEl)
				.setName(p.name)
				.setDesc(p.schema.types.map((t) => t.name).join(" › "))
				.addButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Delete preset")
						.onClick(() => {
							deletePreset(p.name);
							this.display();
						}),
				);
		}
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
		this.display();
		return null;
	}
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
