import { describe, expect, it } from "vitest";
import { flattenNodes } from "../src/compile/numbering";
import { novelTree, tree } from "./helpers";

describe("computeNumbering", () => {
	it("numbers siblings per type and absolutely across the project", () => {
		const root = novelTree();
		const byTitle = Object.fromEntries(flattenNodes(root).map((n) => [n.title, n.numbering]));
		expect(byTitle["Chapter One"]).toMatchObject({ index: 0, number: 1, count: 2, absolute: 1, depth: 1 });
		expect(byTitle["Chapter Two"]).toMatchObject({ index: 1, number: 2, count: 2, absolute: 2, depth: 1 });
		expect(byTitle["Opening"]).toMatchObject({ index: 0, number: 1, count: 2, absolute: 1, depth: 2 });
		expect(byTitle["The Call"]).toMatchObject({ index: 1, number: 2, count: 2, absolute: 2, depth: 2 });
		expect(byTitle["Aftermath"]).toMatchObject({ index: 0, number: 1, count: 1, absolute: 3, depth: 2 });
		expect(byTitle["Aftermath"]!.ancestors.map((a) => a.title)).toEqual(["The Hollow Road", "Chapter Two"]);
		expect(byTitle["Aftermath"]!.ancestors[1]).toMatchObject({ typeId: "chapter", number: 2, absolute: 2 });
	});

	it("counts mixed sibling types independently", () => {
		const root = tree({
			type: "box",
			title: "root",
			children: [
				{ type: "note", title: "a" },
				{ type: "interlude", title: "i" },
				{ type: "note", title: "b" },
			],
		});
		const nums = root.children.map((c) => [c.numbering.index, c.numbering.number, c.numbering.count]);
		expect(nums).toEqual([
			[0, 1, 2],
			[1, 1, 1],
			[2, 2, 2],
		]);
	});
});
