<script lang="ts">
	import type { Comment } from "../../comments/model";
	import { previewQuote, type Thread } from "../../comments/model";
	import { editorTick, focusedCommentId } from "../../comments/store";
	import { formatRelative } from "../../utils/time";
	import { icon } from "../../utils/icons";
	import { getCommentCallbacks } from "./context";

	let { thread, showNote = false }: { thread: Thread; showNote?: boolean } = $props();
	const callbacks = getCommentCallbacks();

	let root = $derived(thread.root);
	let anchorState = $derived.by(() => {
		void $editorTick;
		return callbacks.anchorState(root);
	});
	let focused = $derived($focusedCommentId === root.id);
	let cardEl: HTMLElement | undefined = $state();

	$effect(() => {
		if (!focused || !cardEl) return;
		cardEl.scrollIntoView({ block: "center" });
		const timer = window.setTimeout(() => focusedCommentId.set(null), 1500);
		return () => window.clearTimeout(timer);
	});

	function markdown(el: HTMLElement, comment: Comment): { update(c: Comment): void } {
		const render = (c: Comment): void => {
			el.empty();
			callbacks.renderMarkdown(el, c.body, c.filePath);
		};
		render(comment);
		return { update: render };
	}

	function menu(e: MouseEvent, comment: Comment): void {
		e.stopPropagation();
		callbacks.showMenu(e, [
			{ title: "Edit", icon: "pencil", onClick: () => callbacks.edit(comment) },
			{ title: "Delete", icon: "trash", danger: true, onClick: () => callbacks.delete(comment) },
		]);
	}

	function anchorLabel(state: typeof anchorState): string {
		switch (state) {
			case "moved":
				return "Text was edited; showing the closest match";
			case "missing":
				return "Text no longer found in the note";
			case "unknown":
				return "Open the note to check where this is";
			default:
				return "Jump to text";
		}
	}
</script>

<article class="novelr-comment" class:is-resolved={root.status === "resolved"} class:is-focused={focused} bind:this={cardEl} data-comment-id={root.id}>
	{#if showNote}
		<button class="novelr-link novelr-comment-note" onclick={() => callbacks.jump(root)}>{callbacks.noteTitle(root)}</button>
	{/if}
	<header class="novelr-comment-header">
		<span class="novelr-comment-author">{root.author}</span>
		<span class="novelr-comment-time" title={root.created}>{formatRelative(root.created)}</span>
		{#if root.status === "resolved"}
			<span class="novelr-badge novelr-comment-status" title={root.resolvedBy ? `Resolved by ${root.resolvedBy}` : "Resolved"}>Resolved</span>
		{/if}
		<button class="clickable-icon novelr-icon-button novelr-comment-more" aria-label="More options" use:icon={"more-horizontal"} onclick={(e) => menu(e, root)}></button>
	</header>
	{#if root.anchor}
		<button
			class="novelr-comment-quote"
			class:is-missing={anchorState === "missing"}
			class:is-moved={anchorState === "moved"}
			title={anchorLabel(anchorState)}
			onclick={() => callbacks.jump(root)}
		>
			<span class="novelr-comment-quote-icon" use:icon={anchorState === "missing" ? "unlink" : "quote"}></span>
			<span class="novelr-comment-quote-text">{previewQuote(root.anchor.quote, 140)}</span>
		</button>
	{:else}
		<button class="novelr-comment-quote is-note" title="Open the note" onclick={() => callbacks.jump(root)}>
			<span class="novelr-comment-quote-icon" use:icon={"file-text"}></span>
			<span class="novelr-comment-quote-text">Whole note</span>
		</button>
	{/if}
	<div class="novelr-comment-body markdown-rendered" use:markdown={root}></div>

	{#each thread.replies as reply (reply.id)}
		<div class="novelr-comment-reply" data-comment-id={reply.id}>
			<header class="novelr-comment-header">
				<span class="novelr-comment-author">{reply.author}</span>
				<span class="novelr-comment-time" title={reply.created}>{formatRelative(reply.created)}</span>
				<button class="clickable-icon novelr-icon-button novelr-comment-more" aria-label="More options" use:icon={"more-horizontal"} onclick={(e) => menu(e, reply)}></button>
			</header>
			<div class="novelr-comment-body markdown-rendered" use:markdown={reply}></div>
		</div>
	{/each}

	<footer class="novelr-comment-actions">
		<button class="novelr-comment-action" onclick={() => callbacks.reply(root)}>Reply</button>
		{#if root.status === "open"}
			<button class="novelr-comment-action mod-cta" onclick={() => callbacks.setStatus(root, "resolved")}>Resolve</button>
		{:else}
			<button class="novelr-comment-action" onclick={() => callbacks.setStatus(root, "open")}>Reopen</button>
		{/if}
	</footer>
</article>
