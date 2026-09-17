import { setIcon } from "obsidian";

/** Svelte action: `<span use:icon={"book"}></span>` renders a lucide icon. */
export function icon(el: HTMLElement, name: string | undefined): { update(name: string | undefined): void } {
	const apply = (n: string | undefined): void => {
		el.empty();
		if (n) setIcon(el, n);
	};
	apply(name);
	return { update: apply };
}
