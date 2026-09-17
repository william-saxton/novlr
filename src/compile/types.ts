import type { App } from "obsidian";
import type { NodeKind, Project } from "../model/types";

export interface Ancestor {
	typeId: string;
	title: string;
	number: number;
	absolute: number;
}

export interface Numbering {
	/** 0-based position among all siblings. */
	index: number;
	/** 1-based position among siblings of the same type. */
	number: number;
	/** Total siblings of the same type (including this node). */
	count: number;
	/** 1-based count of this type across the whole project in document order. */
	absolute: number;
	/** Root = 0. */
	depth: number;
	/** Root first, parent last. */
	ancestors: Ancestor[];
}

export interface CompileNode {
	typeId: string;
	kind: NodeKind;
	title: string;
	/** Vault path; "" for the root. */
	path: string;
	/** Content only: frontmatter as parsed by Obsidian, before any stripping. */
	frontmatter: Record<string, unknown>;
	/** Effective status (children push theirs up), or null when unset. */
	status: { id: string; name: string } | null;
	/** Content body; "" for containers. */
	text: string;
	/** Decorations rendered above the body, in insertion order. */
	before: string[];
	/** Decorations rendered below the body, in insertion order. */
	after: string[];
	children: CompileNode[];
	numbering: Numbering;
}

/**
 * node: runs on each targeted node. tree: sees the whole tree before it is built (prune,
 * reorder). join: turns the tree into text. manuscript: edits the text.
 */
export type StepKind = "node" | "tree" | "join" | "manuscript";

interface OptionBase {
	id: string;
	name: string;
	description: string;
}

export type StepOption =
	| (OptionBase & { type: "boolean"; default: boolean })
	| (OptionBase & { type: "text"; default: string; placeholders?: boolean })
	| (OptionBase & { type: "multiline-text"; default: string; placeholders?: boolean })
	| (OptionBase & { type: "select"; default: string; choices: { value: string; label: string }[] })
	| (OptionBase & { type: "node-types"; default: string[] })
	| (OptionBase & { type: "statuses"; default: string[] });

export interface StepDescription {
	/** Built-ins use a plain slug; steps from other plugins should prefix theirs with the plugin id. */
	canonicalID: string;
	name: string;
	description: string;
	kind: StepKind;
	/** True for steps registered by other plugins through the Novelr API. */
	external: boolean;
	/** For node steps the runner prepends the implicit `targets` node-types option. */
	options: StepOption[];
}

export interface FormatEnv {
	projectTitle: string;
	pageBreak: string;
	/** ISO date; defaults to today. */
	date?: string;
}

export interface CompileContext {
	app: App;
	project: Project;
	/** Read-only view of the whole tree. */
	root: CompileNode;
	/** This step's option values with defaults applied. */
	options: Record<string, unknown>;
	/** Placeholder expansion for the given node. */
	format: (fmt: string, node: CompileNode) => string;
	log: (message: string) => void;
	/** Shared across steps in one run; e.g. write-to-note records `writtenPath`. */
	outputs: Record<string, string>;
}

export type NodeCompile = (node: CompileNode, ctx: CompileContext) => void | Promise<void>;
export type TreeCompile = (root: CompileNode, ctx: CompileContext) => void | Promise<void>;
export type JoinCompile = (root: CompileNode, ctx: CompileContext) => string | Promise<string>;
export type ManuscriptCompile = (text: string, ctx: CompileContext) => string | Promise<string>;

export type CompileStep =
	| { description: StepDescription & { kind: "node" }; compile: NodeCompile }
	| { description: StepDescription & { kind: "tree" }; compile: TreeCompile }
	| { description: StepDescription & { kind: "join" }; compile: JoinCompile }
	| { description: StepDescription & { kind: "manuscript" }; compile: ManuscriptCompile };

export interface WorkflowStep {
	/** canonicalID of the step. */
	id: string;
	optionValues: Record<string, unknown>;
}

/** Persisted in plugin settings (vault-wide). */
export interface Workflow {
	name: string;
	description: string;
	steps: WorkflowStep[];
}

/** Implicit option id for node-step targeting. */
export const TARGETS_OPTION_ID = "targets";

export const TARGETS_OPTION: StepOption = {
	id: TARGETS_OPTION_ID,
	name: "Apply to",
	description: "Node types this step runs on. Empty means every node.",
	type: "node-types",
	default: [],
};

export interface ValidationResult {
	errors: string[];
	warnings: string[];
}

export interface RunLogEntry {
	stepIndex: number;
	name: string;
	ms: number;
	messages: string[];
}

export interface RunResult {
	ok: boolean;
	log: RunLogEntry[];
	/** Final manuscript text, when the run reached the join step. */
	output?: string;
	error?: string;
	failedStep?: number;
	outputs: Record<string, string>;
}

export type ProgressCallback = (stepIndex: number, total: number, name: string) => void;
