import { describe, expect, it } from "vitest";
import { InsertBeforeStep, StripFrontmatterStep } from "../src/compile/steps/text";
import { JoinTreeStep } from "../src/compile/steps/joinTree";
import { newWorkflowStep, optionsFor, uniqueWorkflowName, withDefaults } from "../src/compile/workflows";

describe("workflow option defaults", () => {
	it("adds the implicit targets option to node steps only", () => {
		expect(optionsFor(StripFrontmatterStep.description).map((o) => o.id)).toEqual(["targets"]);
		expect(optionsFor(JoinTreeStep.description).map((o) => o.id)).toEqual(["joiner"]);
	});

	it("fills missing values and keeps provided ones", () => {
		const v = withDefaults(InsertBeforeStep.description, { text: "x" });
		expect(v).toEqual({ targets: [], text: "x", skipFirst: false });
		const fresh = newWorkflowStep(InsertBeforeStep.description);
		expect(fresh.id).toBe("insert-before");
		expect(fresh.optionValues["text"]).toBe("# {title}");
		// defaults are copied, not shared
		(fresh.optionValues["targets"] as string[]).push("scene");
		expect(newWorkflowStep(InsertBeforeStep.description).optionValues["targets"]).toEqual([]);
	});

	it("uniqueWorkflowName", () => {
		expect(uniqueWorkflowName("A", ["A", "A 2"])).toBe("A 3");
		expect(uniqueWorkflowName("B", ["A"])).toBe("B");
	});
});
