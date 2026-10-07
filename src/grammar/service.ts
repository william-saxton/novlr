import { Notice, type TFile } from "obsidian";
import { get } from "svelte/store";
import { makeAnchor, type Comment } from "../comments/model";
import { comments } from "../comments/store";
import type NovelrPlugin from "../main";
import { join } from "../model/paths";
import { contentNodes } from "../model/tree";
import type { Project, ProjectNode } from "../model/types";
import { ClaudeCliProvider } from "./claudeCli";
import { buildPrompt, parseFindings } from "./prompt";
import { commentBody, locateFinding, prepareText } from "./text";
import type { GrammarFinding, GrammarProvider, GrammarResult } from "./types";

/** Author recorded on comments the checker creates, so they can be told apart and cleared. */
export const GRAMMAR_AUTHOR = "Grammar check";

/** Runs grammar checks through the configured provider and records findings as comments. */
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

	/** Check one note and comment on it. The note must belong to a project. */
	async checkFile(file: TFile): Promise<GrammarResult | null> {
		const reason = this.blocked() ?? (this.plugin.comments.locateNote(file.path) ? null : "This note is not part of a Novelr project.");
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
		const files = this.filesUnder(project, node);
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

	private filesUnder(project: Project, node: ProjectNode): TFile[] {
		const nodes = node.kind === "content" ? [node] : contentNodes(node);
		const files: TFile[] = [];
		for (const n of nodes) {
			const file = this.plugin.app.vault.getFileByPath(join(project.rootFolder, n.path));
			if (file) files.push(file);
		}
		return files;
	}

	private async check(file: TFile): Promise<GrammarResult> {
		const located = this.plugin.comments.locateNote(file.path);
		if (!located) throw new Error(`${file.basename} is not part of a Novelr project.`);
		const settings = this.plugin.settings;
		const text = await this.plugin.app.vault.read(file);
		const prepared = prepareText(text);
		if (prepared.sentLines.length === 0) return { placed: 0, unplaced: [], total: 0 };
		const prompt = buildPrompt(prepared.numbered, { instructions: settings.grammarInstructions, maxFindings: settings.grammarMaxFindings });
		const reply = await this.provider().run({ prompt, model: settings.grammarModel, timeoutMs: settings.grammarTimeoutSeconds * 1000 });
		const findings = parseFindings(reply);

		if (settings.grammarReplaceExisting) await this.clearFile(file);

		const unplaced: GrammarFinding[] = [];
		let placed = 0;
		for (const finding of findings) {
			const span = locateFinding(prepared, finding);
			if (!span) {
				unplaced.push(finding);
				continue;
			}
			const anchor = makeAnchor(text, span.from, span.to);
			const created = await this.plugin.comments.create(located.project, {
				note: located.note,
				author: GRAMMAR_AUTHOR,
				body: commentBody(finding),
				anchor,
			});
			if (created) placed++;
			else unplaced.push(finding);
		}
		return { placed, unplaced, total: findings.length };
	}

	/** Comments the checker created on a note. */
	private grammarComments(file: TFile): Comment[] {
		const located = this.plugin.comments.locateNote(file.path);
		if (!located) return [];
		return [...get(comments).values()].filter(
			(c) => c.rootFolder === located.project.rootFolder && c.note === located.note && c.author === GRAMMAR_AUTHOR && !c.replyTo,
		);
	}

	/** Delete every grammar comment on a note; returns how many were removed. */
	async clearFile(file: TFile): Promise<number> {
		const mine = this.grammarComments(file);
		for (const c of mine) await this.plugin.comments.delete(c);
		return mine.length;
	}

	async clearNode(project: Project, node: ProjectNode): Promise<void> {
		let removed = 0;
		for (const file of this.filesUnder(project, node)) removed += await this.clearFile(file);
		new Notice(`Removed ${removed} grammar comment${removed === 1 ? "" : "s"}.`);
	}
}

function describe(name: string, r: GrammarResult): string {
	if (r.total === 0) return `No grammar issues found in ${name}.`;
	const base = `${r.placed} grammar comment${r.placed === 1 ? "" : "s"} added to ${name}`;
	return r.unplaced.length > 0 ? `${base}; ${r.unplaced.length} could not be placed.` : `${base}.`;
}
