import { type App, Modal, Setting } from "obsidian";

export interface TextPromptOptions {
	title: string;
	label?: string;
	initial?: string;
	placeholder?: string;
	submitText?: string;
	/** Return an error message to keep the modal open. */
	validate?: (value: string) => string | null;
}

/** Ask for a single line of text; resolves null when cancelled. */
export function promptText(app: App, options: TextPromptOptions): Promise<string | null> {
	return new Promise((resolve) => {
		new TextPromptModal(app, options, resolve).open();
	});
}

class TextPromptModal extends Modal {
	private value: string;
	private resolved = false;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly options: TextPromptOptions,
		private readonly resolve: (value: string | null) => void,
	) {
		super(app);
		this.value = options.initial ?? "";
	}

	override onOpen(): void {
		this.setTitle(this.options.title);
		new Setting(this.contentEl).setName(this.options.label ?? "Name").addText((text) => {
			text
				.setValue(this.value)
				.setPlaceholder(this.options.placeholder ?? "")
				.onChange((v) => {
					this.value = v;
				});
			text.inputEl.addClass("novelr-prompt-input");
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
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
					.setButtonText(this.options.submitText ?? "Save")
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
		const error = this.options.validate?.(this.value) ?? null;
		if (error) {
			this.errorEl?.setText(error);
			return;
		}
		this.finish(this.value);
	}

	private finish(value: string | null): void {
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
