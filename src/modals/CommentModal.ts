import { type App, Modal, Setting } from "obsidian";

export interface CommentPromptOptions {
	title: string;
	/** Quoted text shown above the editor, if the comment is anchored. */
	quote?: string;
	author: string;
	/** Hide the author field (editing keeps the original author). */
	lockAuthor?: boolean;
	initial?: string;
	/** Offer a "suggest a change" field (only sensible when `quote` is set). */
	allowSuggestion?: boolean;
	/** Current suggestion when editing; undefined = none. */
	initialSuggestion?: string;
	submitText?: string;
}

export interface CommentPromptResult {
	author: string;
	body: string;
	/** Replacement text for the quote; undefined when the user did not suggest one. */
	suggestion?: string;
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
	private suggesting: boolean;
	private suggestion: string;
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
		this.suggesting = options.initialSuggestion !== undefined;
		this.suggestion = options.initialSuggestion ?? options.quote ?? "";
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

		let suggestionArea: HTMLTextAreaElement | null = null;
		if (this.options.allowSuggestion && this.options.quote) {
			const row = new Setting(this.contentEl)
				.setName("Suggest a change")
				.setDesc("Propose replacement text. The author can accept it with one click.")
				.addToggle((toggle) =>
					toggle.setValue(this.suggesting).onChange((v) => {
						this.suggesting = v;
						if (suggestionArea) suggestionArea.toggleClass("novelr-hidden", !v);
						if (v) suggestionArea?.focus();
					}),
				);
			row.settingEl.addClass("novelr-comment-suggest-row");
			suggestionArea = this.contentEl.createEl("textarea", { cls: "novelr-comment-textarea novelr-comment-suggestion-input" });
			suggestionArea.rows = 3;
			suggestionArea.placeholder = "Replacement for the quoted text";
			suggestionArea.value = this.suggestion;
			suggestionArea.toggleClass("novelr-hidden", !this.suggesting);
			suggestionArea.addEventListener("input", () => {
				this.suggestion = suggestionArea?.value ?? "";
			});
		}

		const textarea = this.contentEl.createEl("textarea", { cls: "novelr-comment-textarea" });
		textarea.rows = 6;
		textarea.placeholder = this.options.allowSuggestion ? "Explain the comment or the change (Markdown is fine)" : "Write your comment (Markdown is fine)";
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
		const suggesting = this.suggesting && this.options.allowSuggestion && this.options.quote !== undefined;
		if (suggesting && this.suggestion === this.options.quote) {
			this.errorEl?.setText("The suggestion is the same as the original text.");
			return;
		}
		if (this.body.trim().length === 0 && !suggesting) {
			this.errorEl?.setText("Write something first.");
			return;
		}
		this.finish({ author: this.author.trim(), body: this.body, ...(suggesting ? { suggestion: this.suggestion } : {}) });
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
