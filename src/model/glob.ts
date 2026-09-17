/**
 * Tiny glob matcher for relative vault paths.
 * Supports `**` (any depth), `*` (within a segment), `?` (one char).
 * A pattern without a slash matches a path whose basename matches.
 */
export function globToRegExp(pattern: string): RegExp {
	let re = "";
	const p = pattern.replace(/\\/g, "/").replace(/^\/+/, "");
	for (let i = 0; i < p.length; i++) {
		const c = p[i] as string;
		if (c === "*") {
			if (p[i + 1] === "*") {
				// `**/` or trailing `**`
				if (p[i + 2] === "/") {
					re += "(?:.*/)?";
					i += 2;
				} else {
					re += ".*";
					i += 1;
				}
			} else {
				re += "[^/]*";
			}
		} else if (c === "?") {
			re += "[^/]";
		} else if (/[.+^${}()|[\]\\]/.test(c)) {
			re += "\\" + c;
		} else {
			re += c;
		}
	}
	const anchored = p.includes("/") ? `^${re}$` : `(?:^|/)${re}$`;
	return new RegExp(anchored);
}

export function compileGlobs(patterns: string[]): RegExp[] {
	return patterns.filter((p) => p.trim().length > 0).map((p) => globToRegExp(p.trim()));
}

export function matchesAny(regexes: RegExp[], path: string): boolean {
	return regexes.some((r) => r.test(path));
}
