import { str } from "../options";
import type { CompileContext, CompileNode, CompileStep } from "../types";

/** Remove a leading YAML frontmatter block. */
export function stripFrontmatter(text: string): string {
	return text.replace(/^---\r?\n[\s\S]*?(?:\r?\n---|\n\.\.\.)[ \t]*(?:\r?\n|$)/, "");
}

export const StripFrontmatterStep: CompileStep = {
	description: {
		canonicalID: "strip-frontmatter",
		name: "Strip frontmatter",
		description: "Removes the YAML properties block at the top of each note.",
		kind: "node",
		isScript: false,
		options: [],
	},
	compile(node: CompileNode) {
		if (node.kind === "content") node.text = stripFrontmatter(node.text);
	},
};

export interface RemoveLinksOptions {
	wiki: "keep-text" | "remove";
	external: "keep-text" | "keep-url" | "remove";
	embeds: "remove" | "keep";
}

export function removeLinks(text: string, o: RemoveLinksOptions): string {
	let out = text;
	if (o.embeds === "remove") {
		out = out.replace(/!\[\[[^\]]*\]\]/g, "");
		out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
	}
	// A leading "!" marks an embed; keep those intact when embeds are kept. (No lookbehind: mobile WebViews.)
	out = out.replace(/(^|[^!])\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, prefix: string, target: string, alias: string | undefined) => {
		if (o.wiki === "remove") return prefix;
		if (alias !== undefined) return prefix + alias;
		const withoutRef = target.split(/[#^]/)[0] ?? "";
		const base = withoutRef.split("/").pop() ?? "";
		return prefix + (base.length > 0 ? base : target.replace(/^[#^]/, ""));
	});
	out = out.replace(/(^|[^!])\[([^\]]*)\]\(([^)]*)\)/g, (_m, prefix: string, label: string, url: string) => {
		switch (o.external) {
			case "keep-url":
				return prefix + url;
			case "remove":
				return prefix;
			default:
				return prefix + label;
		}
	});
	return out;
}

export const RemoveLinksStep: CompileStep = {
	description: {
		canonicalID: "remove-links",
		name: "Remove links",
		description: "Turns wikilinks and markdown links into plain text and drops embeds.",
		kind: "node",
		isScript: false,
		options: [
			{
				id: "wiki",
				name: "Wikilinks",
				description: "What to do with [[links]].",
				type: "select",
				default: "keep-text",
				choices: [
					{ value: "keep-text", label: "Keep the link text" },
					{ value: "remove", label: "Remove entirely" },
				],
			},
			{
				id: "external",
				name: "Markdown links",
				description: "What to do with [text](url) links.",
				type: "select",
				default: "keep-text",
				choices: [
					{ value: "keep-text", label: "Keep the link text" },
					{ value: "keep-url", label: "Keep the URL" },
					{ value: "remove", label: "Remove entirely" },
				],
			},
			{
				id: "embeds",
				name: "Embeds",
				description: "What to do with ![[embeds]] and images.",
				type: "select",
				default: "remove",
				choices: [
					{ value: "remove", label: "Remove" },
					{ value: "keep", label: "Leave untouched" },
				],
			},
		],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (node.kind !== "content") return;
		node.text = removeLinks(node.text, {
			wiki: ctx.options["wiki"] as RemoveLinksOptions["wiki"],
			external: ctx.options["external"] as RemoveLinksOptions["external"],
			embeds: ctx.options["embeds"] as RemoveLinksOptions["embeds"],
		});
	},
};

export function removeComments(text: string, markdown: boolean, html: boolean): string {
	let out = text;
	if (markdown) out = out.replace(/%%[\s\S]*?%%/g, "");
	if (html) out = out.replace(/<!--[\s\S]*?-->/g, "");
	return out;
}

export const RemoveCommentsStep: CompileStep = {
	description: {
		canonicalID: "remove-comments",
		name: "Remove comments",
		description: "Removes %% markdown %% and <!-- HTML --> comments.",
		kind: "node",
		isScript: false,
		options: [
			{ id: "markdown", name: "Markdown comments", description: "Remove %% comments %%.", type: "boolean", default: true },
			{ id: "html", name: "HTML comments", description: "Remove <!-- comments -->.", type: "boolean", default: true },
		],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (node.kind !== "content") return;
		node.text = removeComments(node.text, ctx.options["markdown"] === true, ctx.options["html"] === true);
	},
};

export function removeStrikethroughs(text: string): string {
	return text.replace(/~~[\s\S]*?~~/g, "");
}

export const RemoveStrikethroughsStep: CompileStep = {
	description: {
		canonicalID: "remove-strikethroughs",
		name: "Remove strikethroughs",
		description: "Deletes ~~struck through~~ text.",
		kind: "node",
		isScript: false,
		options: [],
	},
	compile(node: CompileNode) {
		if (node.kind === "content") node.text = removeStrikethroughs(node.text);
	},
};

export function trimWhitespace(text: string): string {
	return text
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/, ""))
		.join("\n")
		.trim();
}

export const TrimWhitespaceStep: CompileStep = {
	description: {
		canonicalID: "trim-whitespace",
		name: "Trim whitespace",
		description: "Removes trailing spaces on each line and blank lines at the start and end.",
		kind: "node",
		isScript: false,
		options: [],
	},
	compile(node: CompileNode) {
		if (node.kind === "content") node.text = trimWhitespace(node.text);
	},
};

export type HeadingMode = "all" | "matching-title" | "first-line";

export function removeHeadings(text: string, mode: HeadingMode, maxLevel: number, title: string): string {
	const lines = text.split("\n");
	const out: string[] = [];
	let sawContent = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
		let drop = false;
		if (m && (m[1] as string).length <= maxLevel) {
			const headingText = (m[2] as string).trim();
			if (mode === "all") drop = true;
			else if (mode === "matching-title") drop = headingText.toLowerCase() === title.trim().toLowerCase();
			else if (mode === "first-line") drop = !sawContent;
		}
		if (drop) {
			// Also swallow one following blank line so paragraphs stay evenly spaced.
			if (lines[i + 1] !== undefined && (lines[i + 1] as string).trim() === "") i++;
			continue;
		}
		if (line.trim() !== "") sawContent = true;
		out.push(line);
	}
	return out.join("\n");
}

export const RemoveHeadingsStep: CompileStep = {
	description: {
		canonicalID: "remove-headings",
		name: "Remove headings",
		description: "Strips markdown headings, for example the scene title at the top of each scene.",
		kind: "node",
		isScript: false,
		options: [
			{
				id: "mode",
				name: "Which headings",
				description: "All headings, only headings equal to the node title, or only a heading on the first line.",
				type: "select",
				default: "all",
				choices: [
					{ value: "all", label: "All headings" },
					{ value: "matching-title", label: "Headings matching the node title" },
					{ value: "first-line", label: "Only a heading on the first line" },
				],
			},
			{ id: "maxLevel", name: "Up to level", description: "Only remove headings of this level or higher (1-6).", type: "text", default: "6" },
		],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (node.kind !== "content") return;
		const level = Math.max(1, Math.min(6, Number.parseInt(String(ctx.options["maxLevel"]), 10) || 6));
		node.text = removeHeadings(node.text, ctx.options["mode"] as HeadingMode, level, node.title);
	},
};

export const InsertBeforeStep: CompileStep = {
	description: {
		canonicalID: "insert-before",
		name: "Insert before",
		description: "Adds text above each targeted node. Supports placeholders such as {title} and {number}.",
		kind: "node",
		isScript: false,
		options: [
			{ id: "text", name: "Text", description: "Inserted above the node. Use ---- for a horizontal rule.", type: "multiline-text", default: "# {title}", placeholders: true },
			{ id: "skipFirst", name: "Skip the first", description: "Do not insert before the first node of this type among its siblings (useful for separators).", type: "boolean", default: false },
		],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (ctx.options["skipFirst"] === true && node.numbering.number === 1) return;
		node.before.push(ctx.format(str(ctx.options["text"], ""), node));
	},
};

export const InsertAfterStep: CompileStep = {
	description: {
		canonicalID: "insert-after",
		name: "Insert after",
		description: "Adds text below each targeted node. Supports placeholders such as {title} and {number}.",
		kind: "node",
		isScript: false,
		options: [
			{ id: "text", name: "Text", description: "Inserted below the node. Use ---- for a horizontal rule.", type: "multiline-text", default: "----", placeholders: true },
			{ id: "skipLast", name: "Skip the last", description: "Do not insert after the last node of this type among its siblings.", type: "boolean", default: false },
		],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (ctx.options["skipLast"] === true && node.numbering.number === node.numbering.count) return;
		node.after.push(ctx.format(str(ctx.options["text"], ""), node));
	},
};

export function replaceText(text: string, find: string, replacement: string, regex: boolean, flags: string): string {
	if (find.length === 0) return text;
	if (regex) {
		try {
			return text.replace(new RegExp(find, flags), replacement);
		} catch {
			return text;
		}
	}
	return text.split(find).join(replacement);
}

const REPLACE_OPTIONS = [
	{ id: "find", name: "Find", description: "Text or pattern to look for.", type: "text", default: "" },
	{ id: "replace", name: "Replace with", description: "Replacement text. With regex on, $1 refers to the first group.", type: "text", default: "" },
	{ id: "regex", name: "Regular expression", description: "Treat the search as a regular expression.", type: "boolean", default: false },
	{ id: "flags", name: "Flags", description: "Regular expression flags.", type: "text", default: "g" },
] as const;

export const ReplaceTextStep: CompileStep = {
	description: {
		canonicalID: "replace-text",
		name: "Find and replace",
		description: "Replaces text in each targeted node.",
		kind: "node",
		isScript: false,
		options: [...REPLACE_OPTIONS],
	},
	compile(node: CompileNode, ctx: CompileContext) {
		if (node.kind !== "content") return;
		node.text = replaceText(
			node.text,
			str(ctx.options["find"], ""),
			str(ctx.options["replace"], ""),
			ctx.options["regex"] === true,
			str(ctx.options["flags"], "g"),
		);
	},
};

export const FindReplaceStep: CompileStep = {
	description: {
		canonicalID: "find-replace",
		name: "Find and replace",
		description: "Replaces text across the whole manuscript.",
		kind: "manuscript",
		isScript: false,
		options: [...REPLACE_OPTIONS],
	},
	compile(text: string, ctx: CompileContext) {
		return replaceText(
			text,
			str(ctx.options["find"], ""),
			str(ctx.options["replace"], ""),
			ctx.options["regex"] === true,
			str(ctx.options["flags"], "g"),
		);
	},
};

export function normalizeBlankLines(text: string, max: number): string {
	const m = Math.max(0, max);
	return text.replace(new RegExp(`\\n{${m + 2},}`, "g"), "\n".repeat(m + 1));
}

export const NormalizeBlankLinesStep: CompileStep = {
	description: {
		canonicalID: "normalize-blank-lines",
		name: "Normalize blank lines",
		description: "Collapses runs of blank lines.",
		kind: "manuscript",
		isScript: false,
		options: [{ id: "max", name: "Maximum blank lines", description: "Longest run of blank lines to keep.", type: "text", default: "1" }],
	},
	compile(text: string, ctx: CompileContext) {
		const max = Number.parseInt(String(ctx.options["max"]), 10);
		return normalizeBlankLines(text, Number.isNaN(max) ? 1 : max);
	},
};

export const AddFrontmatterStep: CompileStep = {
	description: {
		canonicalID: "add-frontmatter",
		name: "Add frontmatter",
		description: "Prepends a YAML properties block to the manuscript.",
		kind: "manuscript",
		isScript: false,
		options: [{ id: "yaml", name: "Properties", description: "YAML, one key per line.", type: "multiline-text", default: "title: {project.title}", placeholders: true }],
	},
	compile(text: string, ctx: CompileContext) {
		const yaml = ctx.format(str(ctx.options["yaml"], ""), ctx.root).trim();
		return yaml.length === 0 ? text : `---\n${yaml}\n---\n\n${text}`;
	},
};
