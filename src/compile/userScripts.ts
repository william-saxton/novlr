import * as obsidian from "obsidian";
import { TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { writable } from "svelte/store";
import type NovelrPlugin from "../main";
import type { StepRegistry } from "./registry";
import type { CompileStep, StepDescription, StepOption } from "./types";

/** Load problems keyed by script path, for the compile tab. */
export const scriptErrors = writable<Map<string, string>>(new Map());

const OPTION_TYPES = new Set(["boolean", "text", "multiline-text", "select", "node-types"]);

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

function parseChoices(raw: unknown): { value: string; label: string }[] {
	if (!Array.isArray(raw)) return [];
	const out: { value: string; label: string }[] = [];
	for (const c of raw) {
		if (typeof c === "string") out.push({ value: c, label: c });
		else if (isRecord(c) && typeof c["value"] === "string") out.push({ value: c["value"], label: typeof c["label"] === "string" ? c["label"] : c["value"] });
	}
	return out;
}

/** Turn a script's exports into a CompileStep, or throw with a helpful message. */
export function stepFromExports(exports: unknown, canonicalID: string): CompileStep {
	if (!isRecord(exports)) throw new Error("module.exports must be an object.");
	const description = exports["description"];
	const compile = exports["compile"];
	if (!isRecord(description)) throw new Error("Export a `description` object.");
	if (typeof compile !== "function") throw new Error("Export a `compile` function.");
	const kind = description["kind"];
	if (kind !== "node" && kind !== "join" && kind !== "manuscript") {
		throw new Error('description.kind must be "node", "join" or "manuscript".');
	}
	const rawOptions = Array.isArray(description["options"]) ? description["options"] : [];
	const options: StepOption[] = [];
	for (const o of rawOptions) {
		if (!isRecord(o) || typeof o["id"] !== "string" || !OPTION_TYPES.has(String(o["type"]))) {
			throw new Error("Each option needs an id and a valid type.");
		}
		options.push({
			id: o["id"],
			name: typeof o["name"] === "string" ? o["name"] : o["id"],
			description: typeof o["description"] === "string" ? o["description"] : "",
			type: o["type"],
			default: o["default"],
			...(o["type"] === "select" ? { choices: parseChoices(o["choices"]) } : {}),
			...(typeof o["placeholders"] === "boolean" ? { placeholders: o["placeholders"] } : {}),
		} as StepOption);
	}
	const desc: StepDescription = {
		canonicalID,
		name: typeof description["name"] === "string" ? description["name"] : canonicalID,
		description: typeof description["description"] === "string" ? description["description"] : "",
		kind,
		isScript: true,
		options,
	};
	return { description: desc, compile } as CompileStep;
}

/**
 * Loads `.js` files from the configured folder as compile steps and hot-reloads them.
 * Scripts run with `module`, `exports` and a `require` that only resolves "obsidian".
 */
export class UserScriptLoader {
	private readonly loaded = new Map<string, string>(); // path -> canonicalID

	constructor(
		private readonly plugin: NovelrPlugin,
		private readonly registry: StepRegistry,
	) {}

	/** Call from `workspace.onLayoutReady`. */
	start(): void {
		void this.reloadAll();
		const { vault } = this.plugin.app;
		this.plugin.registerEvent(vault.on("create", (f) => this.onChanged(f)));
		this.plugin.registerEvent(vault.on("modify", (f) => this.onChanged(f)));
		this.plugin.registerEvent(vault.on("delete", (f) => this.onDeleted(f.path)));
		this.plugin.registerEvent(
			vault.on("rename", (f, oldPath) => {
				this.onDeleted(oldPath);
				this.onChanged(f);
			}),
		);
	}

	private get folder(): string {
		return normalizePath(this.plugin.settings.userScriptFolder.trim());
	}

	private inFolder(path: string): boolean {
		const folder = this.folder;
		if (!folder) return false;
		return path.startsWith(folder + "/") && path.toLowerCase().endsWith(".js");
	}

	/** Drop every loaded script and load whatever is in the (possibly new) folder. */
	async reloadAll(): Promise<void> {
		for (const id of this.loaded.values()) this.registry.unregister(id);
		this.loaded.clear();
		scriptErrors.set(new Map());
		const folder = this.folder;
		if (!folder) return;
		const dir = this.plugin.app.vault.getFolderByPath(folder);
		if (!dir) return;
		const files: TFile[] = [];
		const visit = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFolder) visit(child);
				else if (child instanceof TFile && child.extension === "js") files.push(child);
			}
		};
		visit(dir);
		for (const file of files) await this.load(file);
	}

	private onChanged(file: TAbstractFile): void {
		if (file instanceof TFile && this.inFolder(file.path)) void this.load(file);
	}

	private onDeleted(path: string): void {
		const id = this.loaded.get(path);
		if (!id) return;
		this.registry.unregister(id);
		this.loaded.delete(path);
		scriptErrors.update((m) => {
			const next = new Map(m);
			next.delete(path);
			return next;
		});
	}

	private async load(file: TFile): Promise<void> {
		const canonicalID = `user:${file.basename}`;
		try {
			const source = await this.plugin.app.vault.read(file);
			const step = evaluateScript(source, canonicalID);
			const previous = this.loaded.get(file.path);
			if (previous && previous !== canonicalID) this.registry.unregister(previous);
			this.registry.register(step);
			this.loaded.set(file.path, canonicalID);
			scriptErrors.update((m) => {
				if (!m.has(file.path)) return m;
				const next = new Map(m);
				next.delete(file.path);
				return next;
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			console.error(`Novelr: could not load script ${file.path}`, e);
			scriptErrors.update((m) => new Map(m).set(file.path, message));
		}
	}
}

/** Evaluate a CommonJS-style script body and convert its exports into a step. */
export function evaluateScript(source: string, canonicalID: string): CompileStep {
	const module: { exports: unknown } = { exports: {} };
	const require = (name: string): unknown => {
		if (name === "obsidian") return obsidian;
		throw new Error(`Scripts can only require "obsidian" (tried "${name}").`);
	};
	// User scripts are an explicit opt-in (a folder the user points at), the same model Longform uses.
	// eslint.config.js relaxes the eval rules for this file only.
	const fn = new Function("module", "exports", "require", source) as (m: unknown, e: unknown, r: unknown) => void;
	fn(module, module.exports, require);
	return stepFromExports(module.exports, canonicalID);
}
