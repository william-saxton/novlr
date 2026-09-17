/** Coerce an option value to a string, falling back when it is missing or not a primitive. */
export function str(value: unknown, fallback: string): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return fallback;
}
