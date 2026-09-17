import { type App, Modal, Notice, Setting, normalizePath, stringifyYaml } from "obsidian";
import type NovelrPlugin from "../main";
import { join, validateName } from "../model/paths";
import { BUILTIN_PRESETS, cloneSchema } from "../model/schema";
import { FRONTMATTER_KEY, serializeProject } from "../model/serialize";
import type { Project, SchemaPreset } from "../model/types";
import { selectedIndexPath } from "../store/projects";
import { FolderSuggest } from "./FolderSuggest";

export class NewProjectModal extends Modal {
	private title = "";
	private location = "";
	private createFolder = true;
	private presetIndex = 0;
	private indexName: string;
	private readonly presets: SchemaPreset[];

	constructor(
		app: App,
		private readonly plugin: NovelrPlugin,
	) {
		super(app);
		this.indexName = plugin.settings.indexNoteName;
		this.presets = [...BUILTIN_PRESETS, ...plugin.settings.presets];
	}

	override onOpen(): void {
		const { contentEl } = this;
		this.setTitle("New project");

		new Setting(contentEl)
			.setName("Title")
			.addText((text) => {
				text.setPlaceholder("Working title").onChange((v) => {
					this.title = v;
				});
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.setName("Location")
			.setDesc("Folder that will contain the project. Leave empty for the vault root.")
			.addText((text) => {
				text.setPlaceholder("Books").onChange((v) => {
					this.location = v;
				});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(contentEl)
			.setName("Create a folder named after the title")
			.setDesc("Turn off to use the location folder itself as the project root.")
			.addToggle((toggle) =>
				toggle.setValue(this.createFolder).onChange((v) => {
					this.createFolder = v;
				}),
			);

		new Setting(contentEl).setName("Structure preset").addDropdown((dropdown) => {
			this.presets.forEach((p, i) => {
				dropdown.addOption(String(i), p.name);
			});
			dropdown.setValue("0").onChange((v) => {
				this.presetIndex = Number(v);
			});
		});

		new Setting(contentEl)
			.setName("Index note name")
			.setDesc("The note that stores the project structure.")
			.addText((text) =>
				text.setValue(this.indexName).onChange((v) => {
					this.indexName = v;
				}),
			);

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText("Create")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);

		this.scope.register([], "Enter", (evt) => {
			if (evt.target instanceof HTMLTextAreaElement) return true;
			void this.submit();
			return false;
		});
	}

	private async submit(): Promise<void> {
		const title = this.title.trim();
		const indexName = this.indexName.trim() || this.plugin.settings.indexNoteName;
		const titleError = validateName(title);
		if (titleError) {
			new Notice(titleError);
			return;
		}
		const nameError = validateName(indexName);
		if (nameError) {
			new Notice(`Index note name: ${nameError}`);
			return;
		}
		const preset = this.presets[this.presetIndex] ?? this.presets[0];
		if (!preset) return;

		const location = normalizePath(this.location.trim());
		const rootFolder = this.createFolder ? normalizePath(join(location, title)) : location;
		const indexPath = normalizePath(join(rootFolder, `${indexName}.md`));
		const { vault } = this.app;

		if (vault.getFileByPath(indexPath)) {
			new Notice(`${indexPath} already exists.`);
			return;
		}
		if (rootFolder !== "" && !vault.getFolderByPath(rootFolder)) {
			if (vault.getFileByPath(rootFolder)) {
				new Notice(`${rootFolder} is a file, not a folder.`);
				return;
			}
			await vault.createFolder(rootFolder);
		}

		const project: Project = {
			indexPath,
			rootFolder,
			title,
			schema: cloneSchema(preset.schema),
			root: { typeId: preset.schema.rootType, kind: "container", name: title, path: "", children: [] },
			workflow: null,
			ignore: [],
			unknown: [],
			missing: [],
			warnings: [],
		};
		const yaml = stringifyYaml({ [FRONTMATTER_KEY]: serializeProject(project) });
		await vault.create(indexPath, `---\n${yaml}---\n`);
		selectedIndexPath.set(indexPath);
		this.close();
		await this.plugin.activateView();
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
