import type { Schema } from "../../model/types";
import type { Row } from "./flatten";
import { resolveDrop, trimDragged, type DragRows, type DropTarget } from "./resolveDrop";

export interface DragIndicator {
	/** Y offset of the indicator line relative to the list element. */
	top: number;
	depth: number;
	valid: boolean;
}

export interface DragControllerOptions {
	listEl: HTMLElement;
	rowSelector: string;
	indentPx: number;
	/** Horizontal offset of depth 0 inside a row. */
	baseIndentPx: number;
	getRows(): Row[];
	getSchema(): Schema;
	getRootTypeId(): string;
	onIndicator(indicator: DragIndicator | null): void;
	onDragState(draggingPath: string | null): void;
	onDrop(target: DropTarget, dragged: Row): void;
}

const DRAG_THRESHOLD_PX = 6;
const TOUCH_HOLD_MS = 350;

/**
 * Pointer-based drag and drop for the flat outline. Rows never move during the drag;
 * an indicator line shows where (and at which depth) the node will land.
 */
export class DragController {
	private pointerId: number | null = null;
	private startX = 0;
	private startY = 0;
	private fromIndex = -1;
	private active = false;
	private drag: DragRows | null = null;
	private rects: { top: number; bottom: number }[] = [];
	private listTop = 0;
	private target: DropTarget | null = null;
	private holdTimer: number | null = null;
	private touchReady = false;

	constructor(private readonly options: DragControllerOptions) {
		options.listEl.addEventListener("pointerdown", this.onPointerDown);
		options.listEl.addEventListener("pointermove", this.onPointerMove);
		options.listEl.addEventListener("pointerup", this.onPointerUp);
		options.listEl.addEventListener("pointercancel", this.onPointerUp);
	}

	destroy(): void {
		const { listEl } = this.options;
		listEl.removeEventListener("pointerdown", this.onPointerDown);
		listEl.removeEventListener("pointermove", this.onPointerMove);
		listEl.removeEventListener("pointerup", this.onPointerUp);
		listEl.removeEventListener("pointercancel", this.onPointerUp);
		this.reset();
	}

	private rowElements(): HTMLElement[] {
		return Array.from(this.options.listEl.querySelectorAll<HTMLElement>(this.options.rowSelector));
	}

	private readonly onPointerDown = (e: PointerEvent): void => {
		if (e.button !== 0 || this.pointerId !== null) return;
		const targetEl = e.target as HTMLElement | null;
		if (!targetEl || targetEl.closest("button, a, input, .novelr-chevron")) return;
		const rowEl = targetEl.closest<HTMLElement>(this.options.rowSelector);
		if (!rowEl) return;
		const index = this.rowElements().indexOf(rowEl);
		if (index === -1) return;
		this.pointerId = e.pointerId;
		this.startX = e.clientX;
		this.startY = e.clientY;
		this.fromIndex = index;
		this.touchReady = e.pointerType !== "touch";
		if (!this.touchReady) {
			this.holdTimer = window.setTimeout(() => {
				this.touchReady = true;
				this.holdTimer = null;
			}, TOUCH_HOLD_MS);
		}
	};

	private readonly onPointerMove = (e: PointerEvent): void => {
		if (e.pointerId !== this.pointerId) return;
		const dx = e.clientX - this.startX;
		const dy = e.clientY - this.startY;
		if (!this.active) {
			if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
			if (!this.touchReady) {
				// Moved before the hold finished: treat as a scroll, not a drag.
				this.reset();
				return;
			}
			this.begin(e);
			if (!this.active) return;
		}
		e.preventDefault();
		this.update(e);
	};

	private readonly onPointerUp = (e: PointerEvent): void => {
		if (e.pointerId !== this.pointerId) return;
		const wasActive = this.active;
		const target = this.target;
		const dragged = this.drag?.dragged;
		this.reset();
		if (wasActive && target && dragged) this.options.onDrop(target, dragged);
	};

	private begin(e: PointerEvent): void {
		const rows = this.options.getRows();
		const drag = trimDragged(rows, this.fromIndex);
		if (!drag) {
			this.reset();
			return;
		}
		const elements = this.rowElements();
		const listRect = this.options.listEl.getBoundingClientRect();
		this.listTop = listRect.top;
		// Rects of the remaining rows, in list order.
		const keep = new Set(drag.list.map((r) => r.node.path));
		this.rects = elements
			.filter((el) => keep.has(el.dataset["path"] ?? ""))
			.map((el) => {
				const r = el.getBoundingClientRect();
				return { top: r.top, bottom: r.bottom };
			});
		this.drag = drag;
		this.active = true;
		try {
			this.options.listEl.setPointerCapture(e.pointerId);
		} catch {
			// Pointer capture can fail if the pointer is gone already; the drag still works.
		}
		this.options.onDragState(drag.dragged.node.path);
	}

	private update(e: PointerEvent): void {
		if (!this.drag) return;
		let listIndex = 0;
		for (const r of this.rects) {
			if (e.clientY > (r.top + r.bottom) / 2) listIndex++;
			else break;
		}
		const listLeft = this.options.listEl.getBoundingClientRect().left;
		const pointerDepth = (e.clientX - listLeft - this.options.baseIndentPx) / this.options.indentPx;
		const target = resolveDrop(this.drag, listIndex, pointerDepth, this.options.getSchema(), this.options.getRootTypeId());
		this.target = target;
		const boundary = listIndex === 0 ? (this.rects[0]?.top ?? this.listTop) : (this.rects[listIndex - 1]?.bottom ?? this.listTop);
		this.options.onIndicator({
			top: boundary - this.listTop,
			depth: target?.depth ?? Math.max(0, Math.round(pointerDepth)),
			valid: target !== null,
		});
	}

	private reset(): void {
		if (this.holdTimer !== null) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
		if (this.pointerId !== null) {
			try {
				this.options.listEl.releasePointerCapture(this.pointerId);
			} catch {
				// Not captured; nothing to release.
			}
		}
		if (this.active) {
			this.options.onIndicator(null);
			this.options.onDragState(null);
		}
		this.pointerId = null;
		this.active = false;
		this.drag = null;
		this.target = null;
		this.rects = [];
		this.fromIndex = -1;
		this.touchReady = false;
	}
}
