import { AbstractInputSuggest, type App, TFolder } from "obsidian";

/** Autocompletes vault folder paths in a text input. */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly onPick?: (folder: TFolder) => void,
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		const folders = this.app.vault.getAllFolders(true);
		return folders.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50);
	}

	override renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.isRoot() ? "/" : folder.path);
	}

	override selectSuggestion(folder: TFolder): void {
		const value = folder.isRoot() ? "" : folder.path;
		this.input.value = value;
		this.input.trigger("input");
		this.onPick?.(folder);
		this.close();
	}
}
