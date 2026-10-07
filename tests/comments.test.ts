import { describe, expect, it } from "vitest";
import {
	applySuggestion,
	buildThreads,
	type Comment,
	locateAnchor,
	makeAnchor,
	newCommentId,
	parseComment,
	replaceCommentBody,
	serializeComment,
} from "../src/comments/model";
import { formatRelative } from "../src/utils/time";

const note = "It was a dark and stormy night. The rain fell in torrents, except at occasional intervals, when it was checked by a violent gust of wind.";

function sample(overrides: Partial<Comment> = {}): Comment {
	return {
		id: "20260926-134012-k3x9",
		filePath: "Book/_comments/20260926-134012-k3x9.md",
		rootFolder: "Book",
		note: "Chapter One/Opening.md",
		author: "Jane",
		created: "2026-09-26T13:40:12.000Z",
		status: "open",
		anchor: makeAnchor(note, 32, 61),
		body: "Too many adverbs here.\n\nConsider *cutting* the second clause.",
		...overrides,
	};
}

describe("comment files", () => {
	it("round-trips through markdown", () => {
		const c = sample();
		const text = serializeComment(c);
		expect(text.startsWith("---\nnovelr-comment: 1\nid: \"20260926-134012-k3x9\"\n")).toBe(true);
		expect(text.endsWith("\n---\n\nToo many adverbs here.\n\nConsider *cutting* the second clause.\n")).toBe(true);
		// Frontmatter as Obsidian would parse it (YAML double-quoted strings are JSON strings).
		const fm: Record<string, unknown> = {};
		for (const line of text.split("\n").slice(1, text.indexOf("\n---\n", 4) === -1 ? 0 : undefined)) {
			const m = /^([a-z-]+): (.*)$/.exec(line);
			if (!m) break;
			fm[m[1]!] = m[2]!.startsWith('"') ? JSON.parse(m[2]!) : Number(m[2]);
		}
		const parsed = parseComment(c.filePath, "Book", fm, text);
		expect(parsed).toEqual(c);
	});

	it("keeps the frontmatter when the body is replaced", () => {
		const text = serializeComment(sample());
		const head = text.slice(0, text.indexOf("\n---\n") + 5);
		expect(replaceCommentBody(text, "Shorter.")).toBe(`${head}\nShorter.\n`);
		expect(replaceCommentBody(text, "  ")).toBe(head);
	});

	it("ignores files without the marker or the essentials", () => {
		expect(parseComment("x.md", "", { id: "a", note: "b" }, "")).toBeNull();
		expect(parseComment("x.md", "", { "novelr-comment": 1, note: "b" }, "")).toBeNull();
		expect(parseComment("x.md", "", undefined, "")).toBeNull();
	});

	it("is tolerant of loosely typed frontmatter", () => {
		const parsed = parseComment(
			"x.md",
			"",
			{ "novelr-comment": 1, id: 42, note: "a\\b.md", status: "weird", offset: "7", quote: "q", created: new Date("2026-01-01T00:00:00Z") },
			"---\nignored: yes\n---\nBody",
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.id).toBe("42");
		expect(parsed!.note).toBe("a/b.md");
		expect(parsed!.status).toBe("open");
		expect(parsed!.author).toBe("Anonymous");
		expect(parsed!.anchor).toEqual({ quote: "q", before: "", after: "", offset: 7 });
		expect(parsed!.created).toBe("2026-01-01T00:00:00.000Z");
		expect(parsed!.body).toBe("Body");
	});

	it("treats an empty quote as a note-level comment", () => {
		const parsed = parseComment("x.md", "", { "novelr-comment": 1, id: "a", note: "n.md", quote: "" }, "");
		expect(parsed!.anchor).toBeNull();
		expect(serializeComment(parsed!)).not.toContain("quote:");
	});

	it("makes sortable ids", () => {
		const id = newCommentId(new Date("2026-09-26T13:40:12Z"), () => 0);
		expect(id).toBe("20260926-134012-aaaa");
		expect(newCommentId(new Date("2026-09-26T13:40:12Z"), () => 0.999)).toBe("20260926-134012-9999");
	});
});

describe("makeAnchor", () => {
	it("captures the quote with context", () => {
		const a = makeAnchor(note, 32, 61)!;
		expect(a.quote).toBe("The rain fell in torrents, ex");
		expect(a.before).toBe("It was a dark and stormy night. ");
		expect(a.after).toBe("cept at occasional intervals, when it wa");
		expect(a.offset).toBe(32);
	});

	it("returns null for an empty selection", () => {
		expect(makeAnchor(note, 5, 5)).toBeNull();
	});
});

describe("locateAnchor", () => {
	it("finds the quote after text moved", () => {
		const a = makeAnchor(note, 32, 61);
		const edited = "# Opening\n\n" + note;
		expect(locateAnchor(edited, a)).toEqual({ from: 43, to: 72, exact: true });
	});

	it("uses context to pick among repeated phrases", () => {
		const text = "the cat sat. the dog sat. the cat sat again.";
		const a = makeAnchor(text, 26, 33); // second "the cat"
		expect(a!.quote).toBe("the cat");
		const shifted = "PREFIX " + text;
		expect(locateAnchor(shifted, a)).toEqual({ from: 33, to: 40, exact: true });
	});

	it("prefers the occurrence nearest the recorded offset when contexts tie", () => {
		const text = "aaa X aaa X aaa X aaa";
		const a = { quote: "X", before: "", after: "", offset: 10 };
		expect(locateAnchor(text, a)).toEqual({ from: 10, to: 11, exact: true });
	});

	it("falls back to the surrounding context when the quote was rewritten", () => {
		const a = makeAnchor(note, 32, 61);
		const rewritten = note.replace("The rain fell in torrents, ex", "Rain poured down, ex");
		const hit = locateAnchor(rewritten, a);
		expect(hit).not.toBeNull();
		expect(hit!.exact).toBe(false);
		expect(rewritten.slice(hit!.from, hit!.to)).toBe("Rain poured down, ex");
	});

	it("gives up when neither the quote nor its context survives", () => {
		const a = makeAnchor(note, 32, 61);
		expect(locateAnchor("Completely different text.", a)).toBeNull();
		expect(locateAnchor(note, null)).toBeNull();
	});
});

describe("buildThreads", () => {
	it("nests replies under roots, ordered by creation", () => {
		const root = sample();
		const r2 = sample({ id: "r2", filePath: "r2.md", replyTo: root.id, created: "2026-09-27T00:00:00Z", anchor: null });
		const r1 = sample({ id: "r1", filePath: "r1.md", replyTo: root.id, created: "2026-09-26T20:00:00Z", anchor: null });
		const orphanReply = sample({ id: "o", filePath: "o.md", replyTo: "missing", anchor: null });
		const threads = buildThreads([r2, root, orphanReply, r1]);
		expect(threads.map((t) => t.root.id)).toEqual([root.id, "o"]);
		expect(threads[0]!.replies.map((r) => r.id)).toEqual(["r1", "r2"]);
	});
});

describe("formatRelative", () => {
	const now = new Date("2026-09-26T12:00:00Z");
	it("describes recent times", () => {
		expect(formatRelative("2026-09-26T11:59:40Z", now)).toBe("just now");
		expect(formatRelative("2026-09-26T11:30:00Z", now)).toBe("30m ago");
		expect(formatRelative("2026-09-26T07:00:00Z", now)).toBe("5h ago");
		expect(formatRelative("2026-09-24T12:00:00Z", now)).toBe("2d ago");
		expect(formatRelative("garbage", now)).toBe("garbage");
	});
});

describe("suggestions", () => {
	const text = "It was a dark and stormy night. The rain fell in torrents, except at occasional intervals.";
	const start = text.indexOf("The rain fell in torrents");
	const anchor = makeAnchor(text, start, start + "The rain fell in torrents".length)!;

	it("round-trips suggestion and resolution through the file format", () => {
		const comment: Comment = {
			id: "20260926-134012-k3x9",
			filePath: "P/_comments/20260926-134012-k3x9.md",
			rootFolder: "P",
			note: "Chapter One/Opening.md",
			author: "Jane",
			created: "2026-09-26T13:40:12.000Z",
			status: "resolved",
			resolvedBy: "Will",
			resolution: "accepted",
			anchor,
			suggestion: "Rain hammered down",
			body: "Tighter.",
		};
		const file = serializeComment(comment);
		expect(file).toContain('suggestion: "Rain hammered down"');
		expect(file).toContain('resolution: "accepted"');
		const fm = Object.fromEntries(
			file.split("\n---\n")[0]!.replace(/^---\n/, "").split("\n").map((l) => {
				const i = l.indexOf(": ");
				const raw = l.slice(i + 2);
				return [l.slice(0, i), raw.startsWith('"') ? JSON.parse(raw) : Number(raw)];
			}),
		);
		const parsed = parseComment(comment.filePath, "P", fm, file)!;
		expect(parsed.suggestion).toBe("Rain hammered down");
		expect(parsed.resolution).toBe("accepted");
		expect(parsed.status).toBe("resolved");
	});

	it("ignores a resolution on an open comment and a suggestion without an anchor", () => {
		const fm = { "novelr-comment": 1, id: "x", note: "n.md", status: "open", resolution: "accepted", suggestion: "y" };
		const parsed = parseComment("P/_comments/x.md", "P", fm, "---\n---\n")!;
		expect(parsed.resolution).toBeUndefined();
		expect(parsed.suggestion).toBeUndefined();
	});

	it("applySuggestion rewrites an exact match and re-anchors", () => {
		const r = applySuggestion(text, anchor, "Rain hammered down")!;
		expect(r.text).toBe("It was a dark and stormy night. Rain hammered down, except at occasional intervals.");
		expect(r.anchor.quote).toBe("Rain hammered down");
		expect(r.anchor.offset).toBe(32);
		expect(locateAnchor(r.text, r.anchor)).toMatchObject({ from: 32, to: 50, exact: true });
	});

	it("applySuggestion refuses when the passage changed or vanished", () => {
		const edited = text.replace("fell in torrents", "poured");
		expect(applySuggestion(edited, anchor, "x")).toBeNull();
		expect(applySuggestion("Nothing here.", anchor, "x")).toBeNull();
		expect(applySuggestion(text, null, "x")).toBeNull();
	});

	it("applySuggestion can delete the passage", () => {
		const r = applySuggestion(text, anchor, "")!;
		expect(r.text).toBe("It was a dark and stormy night. , except at occasional intervals.");
	});
});
