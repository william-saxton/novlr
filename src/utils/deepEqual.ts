/** Structural equality for plain JSON-like values (objects, arrays, primitives). */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
	const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
	if (ak.length !== bk.length) return false;
	return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}
