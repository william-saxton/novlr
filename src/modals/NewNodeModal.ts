import { type App, Modal, Setting } from "obsidian";
import { validateName } from "../model/paths";
import { allowedChildTypes } from "../model/schema";
import { siblingNames } from "../model/tree";
import type { NodeTypeDef, Project, ProjectNode } from "../model/types";

export interface NewNodeResult {
	typeId: string;
	name: string;
}

/** Ask for the type and name of a new node under `parent`; resolves null when cancelled. */
export function promptNewNode(
	app: App,
	project: Project,
	parent: ProjectNode,
	preferredTypeId?: string,
): Promise<NewNodeResult | null> {
	return new Promise((resolve) => {
		new NewNodeModal(app, project, parent, preferredTypeId, resolve).open();
	});
}

class NewNodeModal extends Modal {
	private typeId: string;
	private name = "";
	private resolved = false;
	private errorEl: HTMLElement | null = null;
	private readonly types: NodeTypeDef[];

	constructor(
		app: App,
		project: Project,
		private readonly parent: ProjectNode,
		preferredTypeId: string | undefined,
		private readonly resolve: (value: NewNodeResult | null) => void,
	) {
		super(app);
		this.types = allowedChildTypes(project.schema, parent.typeId);
		const preferred = this.types.find((t) => t.id === preferredTypeId);
		this.typeId = (preferred ?? this.types[0])?.id ?? "";
	}

	override onOpen(): void {
		const parentLabel = this.parent.path === "" ? this.parent.name : this.parent.name;
		this.setTitle(`New node in ${parentLabel}`);

		if (this.types.length === 0) {
			this.contentEl.createEl("p", { text: "This container does not allow any child types." });
			return;
		}

		new Setting(this.contentEl).setName("Type").addDropdown((dropdown) => {
			for (const t of this.types) dropdown.addOption(t.id, `${t.name} (${t.kind})`);
			dropdown.setValue(this.typeId).onChange((v) => {
				this.typeId = v;
			});
		});

		new Setting(this.contentEl).setName("Name").addText((text) => {
			text.setPlaceholder("Untitled").onChange((v) => {
				this.name = v;
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		this.errorEl = this.contentEl.createDiv({ cls: "novelr-form-error" });

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText("Create")
					.setCta()
					.onClick(() => {
						this.submit();
					}),
			);

		this.scope.register([], "Enter", () => {
			this.submit();
			return false;
		});
	}

	private submit(): void {
		const name = this.name.trim();
		const error = validateName(name);
		if (error) {
			this.errorEl?.setText(error);
			return;
		}
		if (siblingNames(this.parent).has(name.toLowerCase())) {
			this.errorEl?.setText(`${name} already exists in ${this.parent.name}.`);
			return;
		}
		this.finish({ typeId: this.typeId, name });
	}

	private finish(value: NewNodeResult | null): void {
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(value);
		}
		this.close();
	}

	override onClose(): void {
		this.finish(null);
		this.contentEl.empty();
	}
}
