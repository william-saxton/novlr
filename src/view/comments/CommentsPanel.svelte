<script lang="ts">
	import { untrack } from "svelte";
	import { buildThreads, type Comment, type Thread } from "../../comments/model";
	import { comments, commentsByNote, focusedCommentId } from "../../comments/store";
	import { relativeTo } from "../../model/paths";
	import type { Project } from "../../model/types";
	import { currentProject, projectContaining, projects } from "../../store/projects";
	import { activeFilePath } from "../../store/ui";
	import { icon } from "../../utils/icons";
	import CommentCard from "./CommentCard.svelte";
	import { getCommentCallbacks } from "./context";

	type Scope = "note" | "project";
	type Filter = "open" | "resolved" | "all";
	type Sort = "position" | "newest";

	const callbacks = getCommentCallbacks();
	let scope: Scope = $state("note");
	let filter: Filter = $state("open");
	let sort: Sort = $state("position");
	let query = $state("");

	/** Project and relative path of the active note, when it is inside a project. */
	let active = $derived.by((): { project: Project; note: string } | null => {
		void $projects;
		const path = $activeFilePath;
		if (!path) return null;
		const project = projectContaining(path);
		if (!project) return null;
		const note = relativeTo(project.rootFolder, path);
		if (note === null || note === "" || note === project.commentsFolder || note.startsWith(project.commentsFolder + "/")) return null;
		return { project, note };
	});

	let project = $derived(scope === "note" ? (active?.project ?? $currentProject) : $currentProject);

	// Clicking a highlight or a tree badge should always land on the comment: switch to the note.
	$effect(() => {
		const id = $focusedCommentId;
		if (!id) return;
		const target = [...$comments.values()].find((c) => c.id === id);
		if (!target) return;
		untrack(() => {
			const onActiveNote = active !== null && target.note === active.note && target.rootFolder === active.project.rootFolder;
			if (!(scope === "project" && onActiveNote)) scope = onActiveNote ? "note" : "project";
			if (target.status === "resolved" && filter === "open") filter = "all";
		});
	});

	function matches(thread: Thread, q: string): boolean {
		if (!q) return true;
		const all = [thread.root, ...thread.replies];
		return all.some((c) => c.body.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || (c.anchor?.quote.toLowerCase().includes(q) ?? false));
	}

	function byFilter(thread: Thread): boolean {
		if (filter === "all") return true;
		return thread.root.status === filter;
	}

	function order(a: Thread, b: Thread): number {
		if (sort === "newest") return b.root.created.localeCompare(a.root.created);
		const pa = a.root.anchor?.offset ?? -1;
		const pb = b.root.anchor?.offset ?? -1;
		return pa - pb || a.root.created.localeCompare(b.root.created);
	}

	/** Threads grouped by note (one group in note scope). */
	let groups = $derived.by((): { note: string; threads: Thread[]; title: string }[] => {
		if (!project) return [];
		const q = query.trim().toLowerCase();
		const byNote = commentsByNote($comments, project.rootFolder);
		const notes = scope === "note" ? (active ? [active.note] : []) : [...byNote.keys()].sort((a, b) => a.localeCompare(b));
		const out: { note: string; threads: Thread[]; title: string }[] = [];
		for (const note of notes) {
			const list: Comment[] = byNote.get(note) ?? [];
			const threads = buildThreads(list).filter(byFilter).filter((t) => matches(t, q)).sort(order);
			if (threads.length === 0) continue;
			const sample = threads[0]?.root;
			out.push({ note, threads, title: sample ? callbacks.noteTitle(sample) : note });
		}
		return out;
	});

	let total = $derived(groups.reduce((n, g) => n + g.threads.length, 0));
</script>

<div class="novelr-comments">
	<div class="novelr-comments-toolbar">
		<div class="novelr-segmented">
			<button class:is-active={scope === "note"} onclick={() => (scope = "note")}>This note</button>
			<button class:is-active={scope === "project"} onclick={() => (scope = "project")}>Project</button>
		</div>
		<select class="dropdown novelr-comments-filter" bind:value={filter} aria-label="Show">
			<option value="open">Open</option>
			<option value="resolved">Resolved</option>
			<option value="all">All</option>
		</select>
		<button
			class="clickable-icon novelr-icon-button"
			aria-label={sort === "position" ? "Sorted by position; click for newest first" : "Sorted newest first; click for position"}
			use:icon={sort === "position" ? "list-ordered" : "clock"}
			onclick={() => (sort = sort === "position" ? "newest" : "position")}
		></button>
		<button
			class="clickable-icon novelr-icon-button"
			aria-label="Comment on this note"
			use:icon={"message-square-plus"}
			disabled={!active}
			onclick={() => callbacks.addNoteComment()}
		></button>
	</div>
	<div class="novelr-comments-search">
		<input type="search" placeholder="Search comments" bind:value={query} />
	</div>

	{#if !project}
		<div class="novelr-empty"><p>No project selected.</p></div>
	{:else if scope === "note" && !active}
		<div class="novelr-empty">
			<p>Open a note of {project.title} to see its comments.</p>
			<button onclick={() => (scope = "project")}>Show the whole project</button>
		</div>
	{:else if total === 0}
		<div class="novelr-empty">
			<p class="novelr-muted">
				{#if filter === "open"}No open comments.{:else if filter === "resolved"}No resolved comments.{:else}No comments yet.{/if}
			</p>
			{#if active && scope === "note"}
				<p class="novelr-muted">Select text and run “Add comment” from the editor menu or the command palette.</p>
			{/if}
		</div>
	{:else}
		<div class="novelr-comments-list">
			{#each groups as group (group.note)}
				{#if scope === "project"}
					<div class="novelr-comments-note">
						<span class="novelr-comments-note-title" title={group.note}>{group.title}</span>
						<span class="novelr-count">{group.threads.length}</span>
					</div>
				{/if}
				{#each group.threads as thread (thread.root.id)}
					<CommentCard {thread} />
				{/each}
			{/each}
		</div>
	{/if}
</div>
