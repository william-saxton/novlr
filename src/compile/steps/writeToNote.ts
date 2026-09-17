import { normalizePath } from "obsidian";
import { str } from "../options";
import type { CompileContext, CompileStep } from "../types";

export const WRITTEN_PATH = "writtenPath";

export const WriteToNoteStep: CompileStep = {
	description: {
		canonicalID: "write-to-note",
		name: "Save as note",
		description: "Writes the manuscript to a note in the vault.",
		kind: "manuscript",
		external: false,
		options: [
			{
				id: "path",
				name: "Path",
				description: "Vault path of the note. {root} is the project folder; {project.title} and {date} also work.",
				type: "text",
				default: "{root}/Manuscript/{project.title}.md",
				placeholders: true,
			},
			{ id: "overwrite", name: "Overwrite", description: "Replace the note if it already exists.", type: "boolean", default: true },
			{ id: "open", name: "Open when done", description: "Open the note after writing.", type: "boolean", default: true },
		],
	},
	async compile(text: string, ctx: CompileContext) {
		const raw = str(ctx.options["path"], "").replace(/\{root\}/g, ctx.project.rootFolder);
		let path = normalizePath(ctx.format(raw, ctx.root));
		if (!path.toLowerCase().endsWith(".md")) path += ".md";
		const { vault, workspace } = ctx.app;
		const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		if (folder && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
		const existing = vault.getFileByPath(path);
		if (existing) {
			if (ctx.options["overwrite"] !== true) throw new Error(`${path} already exists and overwrite is off.`);
			await vault.modify(existing, text);
		} else {
			await vault.create(path, text);
		}
		ctx.outputs[WRITTEN_PATH] = path;
		ctx.log(`Wrote ${path}`);
		if (ctx.options["open"] === true) {
			const file = vault.getFileByPath(path);
			if (file) await workspace.getLeaf(false).openFile(file);
		}
		return text;
	},
};
