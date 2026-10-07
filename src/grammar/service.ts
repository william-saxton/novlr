import { Notice, type TFile } from "obsidian";
import type NovelrPlugin from "../main";
import { join } from "../model/paths";
import { contentNodes } from "../model/tree";
import type { Project, ProjectNode } from "../model/types";
import { ClaudeCliProvider } from "./claudeCli";
import { buildPrompt, parseFindings } from "./prompt";
import { applyFindings, countGrammarComments, prepareText, stripGrammarComments } from "./text";
import type { GrammarProvider, GrammarResult } from "./types";

/** Runs grammar checks through the configured provider and writes findings as comments. */
export class GrammarService {
	private readonly providers: GrammarProvider[];
	private running = false;

	constructor(private readonly plugin: NovelrPlugin) {
		this.providers = [new ClaudeCliProvider(() => plugin.settings.grammarCliPath)];
	}

	get enabled(): boolean {
		return this.plugin.settings.grammarEnabled;
	}

	get busy(): boolean {
		return this.running;
	}

	provider(): GrammarProvider {
		return this.providers.find((p) => p.id === this.plugin.settings.grammarProvider) ?? (this.providers[0] as GrammarProvider);
	}

	/** Null when a check can run now, else the reason it cannot. */
	blocked(): string | null {
		if (!this.enabled) return "Grammar checking is turned off in settings.";
		if (this.running) return "A grammar check is already running.";
		return this.provider().available();
	}

	/** Check one note and annotate it. */
	async checkFile(file: TFile): Promise<GrammarResult | null> {
		const reason = this.blocked();
		if (reason) {
			new Notice(reason);
			return null;
		}
		this.running = true;
		const notice = new Notice(`Checking grammar in ${file.basename}…`, 0);
		try {
			const result = await this.check(file);
			notice.hide();
			new Notice(describe(file.basename, result));
			return result;
		} catch (e) {
			notice.hide();
			new Notice(`Grammar check failed: ${e instanceof Error ? e.message : String(e)}`, 8000);
			return null;
		} finally {
			this.running = false;
		}
	}

	/** Check every content node under `node` (or the node itself), one note at a time. */
	async checkNode(project: Project, node: ProjectNode): Promise<void> {
		const reason = this.blocked();
		if (reason) {
			new Notice(reason);
			return;
		}
		const nodes = node.kind === "content" ? [node] : contentNodes(node);
		const files = nodes
			.map((n) => this.plugin.app.vault.getFileByPath(join(project.rootFolder, n.path)))
			.filter((f): f is TFile => f !== null);
		if (files.length === 0) {
			new Notice("Nothing to check.");
			return;
		}
		this.running = true;
		const notice = new Notice("", 0);
		let placed = 0;
		let failed = 0;
		try {
			let i = 0;
			for (const file of files) {
				i++;
				notice.setMessage(`Checking grammar ${i}/${files.length}: ${file.basename}…`);
				try {
					placed += (await this.check(file)).placed;
				} catch (e) {
					failed++;
					console.error("Novelr: grammar check failed for", file.path, e);
				}
			}
		} finally {
			this.running = false;
			notice.hide();
		}
		new Notice(`Grammar: ${placed} comment${placed === 1 ? "" : "s"} added across ${files.length} note${files.length === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
	}

	private async check(file: TFile): Promise<GrammarResult> {
		const settings = this.plugin.settings;
		const original = await this.plugin.app.vault.read(file);
		const prepared = prepareText(original);
		if (prepared.sent.length === 0) return { placed: 0, unplaced: [], total: 0 };
		const prompt = buildPrompt(prepared.numbered, { instructions: settings.grammarInstructions, maxFindings: settings.grammarMaxFindings });
		const reply = await this.provider().run({ prompt, model: settings.grammarModel, timeoutMs: settings.grammarTimeoutSeconds * 1000 });
		const findings = parseFindings(reply);
		const applied = applyFindings(prepared, findings);
		if (findings.length > 0) {
			await this.plugin.app.vault.process(file, (current) => {
				// Re-derive from the current content in case the note changed while waiting.
				const fresh = prepareText(settings.grammarReplaceExisting ? stripGrammarComments(current) : current);
				return applyFindings(fresh, findings).text;
			});
		}
		return { placed: applied.placed, unplaced: applied.unplaced, total: findings.length };
	}

	/** Delete every grammar comment from a note. */
	async clearFile(file: TFile): Promise<number> {
		let removed = 0;
		await this.plugin.app.vault.process(file, (current) => {
			removed = countGrammarComments(current);
			return stripGrammarComments(current);
		});
		return removed;
	}

	async clearNode(project: Project, node: ProjectNode): Promise<void> {
		const nodes = node.kind === "content" ? [node] : contentNodes(node);
		let removed = 0;
		for (const n of nodes) {
			const file = this.plugin.app.vault.getFileByPath(join(project.rootFolder, n.path));
			if (file) removed += await this.clearFile(file);
		}
		new Notice(`Removed ${removed} grammar comment${removed === 1 ? "" : "s"}.`);
	}
}

function describe(name: string, r: GrammarResult): string {
	if (r.total === 0) return `No grammar issues found in ${name}.`;
	const base = `${r.placed} grammar comment${r.placed === 1 ? "" : "s"} added to ${name}`;
	return r.unplaced.length > 0 ? `${base}; ${r.unplaced.length} could not be placed.` : `${base}.`;
}
