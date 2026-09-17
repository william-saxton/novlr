import type { CompileNode, FormatEnv } from "./types";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** English words for 0..9999; larger values fall back to digits. */
export function toWords(n: number): string {
	if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
	if (n < 20) return ONES[n] as string;
	if (n < 100) {
		const t = TENS[Math.floor(n / 10)] as string;
		const o = n % 10;
		return o === 0 ? t : `${t}-${ONES[o] as string}`;
	}
	if (n < 1000) {
		const h = `${ONES[Math.floor(n / 100)] as string} hundred`;
		const rest = n % 100;
		return rest === 0 ? h : `${h} ${toWords(rest)}`;
	}
	const th = `${toWords(Math.floor(n / 1000))} thousand`;
	const rest = n % 1000;
	return rest === 0 ? th : `${th} ${toWords(rest)}`;
}

const ROMAN: [number, string][] = [
	[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
	[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
	if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
	let out = "";
	let rest = n;
	for (const [value, glyph] of ROMAN) {
		while (rest >= value) {
			out += glyph;
			rest -= value;
		}
	}
	return out;
}

function capitalize(s: string): string {
	return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function applyModifier(value: number, modifier: string | undefined): string {
	switch (modifier) {
		case undefined:
			return String(value);
		case "word":
			return toWords(value);
		case "Word":
			return capitalize(toWords(value));
		case "WORD":
			return toWords(value).toUpperCase();
		case "roman":
			return toRoman(value).toLowerCase();
		case "Roman":
			return toRoman(value);
		case "pad2":
			return String(value).padStart(2, "0");
		case "pad3":
			return String(value).padStart(3, "0");
		default:
			return String(value);
	}
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9-]*)(?:\.([A-Za-z]+))?(?::([A-Za-z0-9]+))?\}/g;

function today(): string {
	const d = new Date();
	const pad = (n: number): string => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Expand placeholders for `node`. Unknown placeholders are left verbatim and reported
 * through `onUnknown`. The whole value `----` renders a horizontal rule.
 */
export function formatPlaceholders(
	fmt: string,
	node: CompileNode,
	env: FormatEnv,
	onUnknown?: (placeholder: string) => void,
): string {
	if (fmt.trim() === "----") return "---";
	return fmt.replace(PLACEHOLDER, (whole, head: string, field: string | undefined, modifier: string | undefined) => {
		// Self fields
		if (field === undefined) {
			switch (head) {
				case "title":
					return node.title;
				case "type":
					return node.typeId;
				case "number":
					return applyModifier(node.numbering.number, modifier);
				case "count":
					return applyModifier(node.numbering.count, modifier);
				case "index":
					return applyModifier(node.numbering.index, modifier);
				case "absolute":
					return applyModifier(node.numbering.absolute, modifier);
				case "depth":
					return applyModifier(node.numbering.depth, modifier);
				case "date":
					return env.date ?? today();
				case "BR":
					return "\n";
				case "PB":
					return env.pageBreak;
				default:
					break;
			}
		} else {
			// Scoped fields: parent.*, project.*, <typeId>.*
			let target: { title: string; number: number; absolute: number } | undefined;
			if (head === "project") {
				if (field === "title") return env.projectTitle;
			} else if (head === "parent") {
				target = node.numbering.ancestors[node.numbering.ancestors.length - 1];
			} else if (node.typeId === head) {
				target = { title: node.title, number: node.numbering.number, absolute: node.numbering.absolute };
			} else {
				for (let i = node.numbering.ancestors.length - 1; i >= 0; i--) {
					const a = node.numbering.ancestors[i];
					if (a && a.typeId === head) {
						target = a;
						break;
					}
				}
			}
			if (target) {
				switch (field) {
					case "title":
						return target.title;
					case "number":
						return applyModifier(target.number, modifier);
					case "absolute":
						return applyModifier(target.absolute, modifier);
					default:
						break;
				}
			}
		}
		onUnknown?.(whole);
		return whole;
	});
}
