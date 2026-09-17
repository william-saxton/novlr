import { AbstractInputSuggest, type App, getIconIds, setIcon } from "obsidian";

/** Strip the `lucide-` prefix so stored ids stay short; setIcon accepts both forms. */
function shortId(id: string): string {
	return id.startsWith("lucide-") ? id.slice(7) : id;
}

/** Autocompletes registered icon ids in a text input, showing a preview of each. */
export class IconSuggest extends AbstractInputSuggest<string> {
	private readonly ids: string[];

	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly onPick: (id: string) => void,
	) {
		super(app, input);
		this.ids = [...new Set(getIconIds().map(shortId))].sort();
		this.limit = 60;
	}

	protected getSuggestions(query: string): string[] {
		const q = query.trim().toLowerCase();
		if (q.length === 0) return this.ids;
		const starts = this.ids.filter((id) => id.startsWith(q));
		const contains = this.ids.filter((id) => !id.startsWith(q) && id.includes(q));
		return [...starts, ...contains];
	}

	override renderSuggestion(id: string, el: HTMLElement): void {
		el.addClass("novelr-icon-suggestion");
		const preview = el.createSpan({ cls: "novelr-icon-suggestion-icon" });
		setIcon(preview, id);
		el.createSpan({ text: id });
	}

	override selectSuggestion(id: string): void {
		this.input.value = id;
		this.input.trigger("input");
		this.onPick(id);
		this.close();
	}
}
