import { type App, Modal, Setting } from "obsidian";

export interface CommentPromptOptions {
	title: string;
	/** Quoted text shown above the editor, if the comment is anchored. */
	quote?: string;
	author: string;
	/** Hide the author field (editing keeps the original author). */
	lockAuthor?: boolean;
	initial?: string;
	submitText?: string;
}

export interface CommentPromptResult {
	author: string;
	body: string;
}

/** Ask for a comment body (and author); resolves null when cancelled. */
export function promptComment(app: App, options: CommentPromptOptions): Promise<CommentPromptResult | null> {
	return new Promise((resolve) => {
		new CommentModal(app, options, resolve).open();
	});
}

class CommentModal extends Modal {
	private author: string;
	private body: string;
	private resolved = false;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly options: CommentPromptOptions,
		private readonly resolve: (value: CommentPromptResult | null) => void,
	) {
		super(app);
		this.author = options.author;
		this.body = options.initial ?? "";
	}

	override onOpen(): void {
		this.setTitle(this.options.title);
		this.modalEl.addClass("novelr-comment-modal");

		if (this.options.quote) {
			const quote = this.contentEl.createEl("blockquote", { cls: "novelr-comment-quote" });
			quote.setText(this.options.quote);
		}

		if (!this.options.lockAuthor) {
			new Setting(this.contentEl)
				.setName("Your name")
				.setDesc("Shown next to the comment. Remembered on this device.")
				.addText((text) => {
					text
						.setValue(this.author)
						.setPlaceholder("Name")
						.onChange((v) => {
							this.author = v;
						});
				});
		}

		const textarea = this.contentEl.createEl("textarea", { cls: "novelr-comment-textarea" });
		textarea.rows = 6;
		textarea.placeholder = "Write your comment (Markdown is fine)";
		textarea.value = this.body;
		textarea.addEventListener("input", () => {
			this.body = textarea.value;
		});
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				this.submit();
			}
		});
		this.errorEl = this.contentEl.createDiv({ cls: "novelr-form-error" });
		new Setting(this.contentEl)
			.setDesc("Ctrl/Cmd+Enter to save")
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
		window.setTimeout(() => {
			if (!this.author && !this.options.lockAuthor) this.contentEl.querySelector<HTMLInputElement>("input")?.focus();
			else textarea.focus();
		}, 0);
	}

	private submit(): void {
		if (this.body.trim().length === 0) {
			this.errorEl?.setText("Write something first.");
			return;
		}
		this.finish({ author: this.author.trim(), body: this.body });
	}

	private finish(value: CommentPromptResult | null): void {
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
