export interface Debounced<A extends unknown[]> {
	(...args: A): void;
	cancel(): void;
	flush(): void;
}

/** Trailing-edge debounce. `flush()` runs a pending call immediately. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
	let timer: number | null = null;
	let pending: A | null = null;
	const run = (): void => {
		timer = null;
		if (pending) {
			const args = pending;
			pending = null;
			fn(...args);
		}
	};
	const debounced = ((...args: A) => {
		pending = args;
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(run, wait);
	}) as Debounced<A>;
	debounced.cancel = () => {
		if (timer) window.clearTimeout(timer);
		timer = null;
		pending = null;
	};
	debounced.flush = () => {
		if (timer) window.clearTimeout(timer);
		run();
	};
	return debounced;
}
