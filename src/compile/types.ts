import type { App } from "obsidian";
import type { NodeKind, Project } from "../model/types";

export interface Ancestor {
	typeId: string;
	title: string;
	number: number;
}

export interface Numbering {
	/** 0-based position among all siblings. */
	index: number;
	/** 1-based position among siblings of the same type. */
	number: number;
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
	/** Content body; "" for containers. */
	text: string;
	/** Decorations rendered above the body, in insertion order. */
	before: string[];
	/** Decorations rendered below the body, in insertion order. */
	after: string[];
	children: CompileNode[];
	numbering: Numbering;
}

export type StepKind = "node" | "join" | "manuscript";

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
	| (OptionBase & { type: "node-types"; default: string[] });

export interface StepDescription {
	/** Built-ins use a plain slug; user scripts use "user:<basename>". */
	canonicalID: string;
	name: string;
	description: string;
	kind: StepKind;
	isScript: boolean;
	/** For node steps the runner prepends the implicit `targets` node-types option. */
	options: StepOption[];
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
}

export type NodeCompile = (node: CompileNode, ctx: CompileContext) => void | Promise<void>;
export type JoinCompile = (root: CompileNode, ctx: CompileContext) => string | Promise<string>;
export type ManuscriptCompile = (text: string, ctx: CompileContext) => string | Promise<string>;

export type CompileStep =
	| { description: StepDescription & { kind: "node" }; compile: NodeCompile }
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
