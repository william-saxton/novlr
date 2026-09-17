/** Forward-slash path helpers that work identically on every platform (no Node `path`). */

export function join(...parts: string[]): string {
	return parts
		.filter((p) => p.length > 0)
		.join("/")
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "");
}

export function dirname(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? path : path.slice(i + 1);
}

export function stripMd(name: string): string {
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export function isMarkdown(path: string): boolean {
	return path.toLowerCase().endsWith(".md");
}

/** True when `child` is `parent` or lies inside it. `parent === ""` means the vault root and contains everything. */
export function isInside(parent: string, child: string): boolean {
	if (parent === "") return true;
	return child === parent || child.startsWith(parent + "/");
}

/** `child` relative to `parent`; returns null when child is not inside parent. */
export function relativeTo(parent: string, child: string): string | null {
	if (parent === "") return child;
	if (child === parent) return "";
	if (!child.startsWith(parent + "/")) return null;
	return child.slice(parent.length + 1);
}

const ILLEGAL = /[\\/:*?"<>|]/;

/** Validate a folder or file basename for all desktop platforms. Returns an error message or null. */
export function validateName(name: string): string | null {
	if (name.trim().length === 0) return "Name cannot be empty.";
	if (name !== name.trim()) return "Name cannot start or end with whitespace.";
	if (name.startsWith(".")) return "Name cannot start with a dot.";
	if (name.endsWith(".")) return "Name cannot end with a dot.";
	if (ILLEGAL.test(name)) return 'Name cannot contain any of \\ / : * ? " < > |';
	return null;
}
