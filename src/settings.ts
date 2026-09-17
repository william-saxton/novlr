import { type App, PluginSettingTab, Setting } from "obsidian";
import type NovelrPlugin from "./main";
import type { SchemaPreset } from "./model/types";
import type { Workflow } from "./compile/types";

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
}

export const DEFAULT_SETTINGS: NovelrSettings = {
	presets: [],
	workflows: [],
	userScriptFolder: "",
	pageBreak: '<div style="page-break-after: always;"></div>',
	indexNoteName: "novelr",
	writeNodeType: true,
	confirmDelete: true,
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
			.setName("Write node type to new files")
			.setDesc("Add a novelr-type property to content files created from the structure pane.")
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

		new Setting(containerEl).setName("Compile").setHeading();

		new Setting(containerEl)
			.setName("User script folder")
			.setDesc("Vault folder containing .js files that define custom compile steps. Leave empty to disable.")
			.addText((text) =>
				text.setValue(this.plugin.settings.userScriptFolder).onChange(async (value) => {
					this.plugin.settings.userScriptFolder = value.trim();
					await this.plugin.saveSettings();
				}),
			);

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
}
