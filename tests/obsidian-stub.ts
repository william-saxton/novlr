// Minimal stand-in for the `obsidian` package so pure modules can be unit tested
// without Obsidian. Only the handful of runtime exports the pure modules touch.

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}
