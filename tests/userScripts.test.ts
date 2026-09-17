import { describe, expect, it } from "vitest";
import { stepFromExports } from "../src/compile/userScripts";

describe("stepFromExports", () => {
	it("accepts a minimal node step", () => {
		const step = stepFromExports(
			{
				description: { name: "Shout", kind: "node", options: [{ id: "loud", type: "boolean", default: true }] },
				compile: () => undefined,
			},
			"user:shout",
		);
		expect(step.description).toMatchObject({ canonicalID: "user:shout", name: "Shout", kind: "node", isScript: true });
		expect(step.description.options[0]).toMatchObject({ id: "loud", name: "loud", type: "boolean", default: true });
	});

	it("rejects bad shapes", () => {
		expect(() => stepFromExports(null, "x")).toThrow();
		expect(() => stepFromExports({ description: {}, compile: () => undefined }, "x")).toThrow(/kind/);
		expect(() => stepFromExports({ description: { kind: "node" } }, "x")).toThrow(/compile/);
		expect(() => stepFromExports({ description: { kind: "node", options: [{ type: "boolean" }] }, compile: () => undefined }, "x")).toThrow(/option/);
	});
});
