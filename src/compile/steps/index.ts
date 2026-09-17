import type { CompileStep } from "../types";
import { FilterStatusStep } from "./filterStatus";
import { JoinTreeStep } from "./joinTree";
import {
	AddFrontmatterStep,
	FindReplaceStep,
	InsertAfterStep,
	InsertBeforeStep,
	NormalizeBlankLinesStep,
	RemoveCommentsStep,
	RemoveHeadingsStep,
	RemoveLinksStep,
	RemoveStrikethroughsStep,
	ReplaceTextStep,
	StripFrontmatterStep,
	TrimWhitespaceStep,
} from "./text";
import { WriteToNoteStep } from "./writeToNote";

export const BUILTIN_STEPS: CompileStep[] = [
	StripFrontmatterStep,
	RemoveLinksStep,
	RemoveCommentsStep,
	RemoveStrikethroughsStep,
	RemoveHeadingsStep,
	InsertBeforeStep,
	InsertAfterStep,
	ReplaceTextStep,
	TrimWhitespaceStep,
	FilterStatusStep,
	JoinTreeStep,
	NormalizeBlankLinesStep,
	FindReplaceStep,
	AddFrontmatterStep,
	WriteToNoteStep,
];
