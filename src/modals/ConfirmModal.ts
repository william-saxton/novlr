import { type App, Modal, Setting } from "obsidian";

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmText?: string;
	danger?: boolean;
}

/** Simple confirm dialog; resolves true when confirmed. */
export function confirm(app: App, options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, options, resolve).open();
	});
}

class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly options: ConfirmOptions,
		private readonly resolve: (value: boolean) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.options.title);
		this.contentEl.createEl("p", { text: this.options.message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			)
			.addButton((button) => {
				button.setButtonText(this.options.confirmText ?? "Confirm").onClick(() => {
					this.finish(true);
				});
				// setDestructive() needs Obsidian 1.13; the class is what older versions' setWarning() applied.
				if (this.options.danger) button.buttonEl.addClass("mod-warning");
				else button.setCta();
			});
		this.scope.register([], "Enter", () => {
			this.finish(true);
			return false;
		});
	}

	private finish(value: boolean): void {
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(value);
		}
		this.close();
	}

	override onClose(): void {
		this.finish(false);
		this.contentEl.empty();
	}
}
