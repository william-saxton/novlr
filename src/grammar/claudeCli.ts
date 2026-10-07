import { Platform } from "obsidian";
import type { GrammarProvider, GrammarRequest } from "./types";

/** The slice of Node's ChildProcess this module uses; typed locally so no Node module is imported. */
interface Stream {
	setEncoding(encoding: string): void;
	on(event: "data", listener: (chunk: string) => void): void;
	on(event: "error", listener: (error: Error) => void): void;
	end(data?: string): void;
}
interface ChildProcess {
	stdout: Stream | null;
	stderr: Stream | null;
	stdin: Stream | null;
	kill(): void;
	on(event: "error", listener: (error: Error) => void): void;
	on(event: "close", listener: (code: number | null) => void): void;
}
type SpawnFn = (
	command: string,
	args: string[],
	options: { shell: boolean; windowsHide: boolean; stdio: [string, string, string] },
) => ChildProcess;

/** Node's child_process, available only in the desktop app. */
function loadSpawn(): SpawnFn | null {
	if (!Platform.isDesktopApp) return null;
	const req = (window as { require?: (id: string) => unknown }).require;
	if (typeof req !== "function") return null;
	try {
		const mod = req("child_process") as { spawn?: SpawnFn };
		return typeof mod.spawn === "function" ? mod.spawn : null;
	} catch {
		return null;
	}
}

/**
 * Runs `claude -p` and returns its reply. Uses whatever login and model the user's
 * Claude Code CLI already has, so no key is stored by the plugin.
 */
export class ClaudeCliProvider implements GrammarProvider {
	readonly id = "claude-cli";
	readonly name = "Claude Code CLI";

	constructor(private readonly getPath: () => string) {}

	available(): string | null {
		if (!Platform.isDesktopApp) return "Grammar checking needs the desktop app.";
		if (!loadSpawn()) return "Could not access the system shell.";
		if (this.getPath().trim().length === 0) return "Set the Claude CLI path in settings.";
		return null;
	}

	run(request: GrammarRequest, signal?: AbortSignal): Promise<string> {
		const spawn = loadSpawn();
		if (!spawn) return Promise.reject(new Error("Grammar checking needs the desktop app."));
		const args = ["-p", "--output-format", "json", "--no-session-persistence"];
		if (request.model.trim()) args.push("--model", request.model.trim());
		const command = this.getPath().trim();

		return new Promise<string>((resolve, reject) => {
			let child: ChildProcess;
			try {
				child = spawn(command, args, {
					// Windows installs `claude` as a .cmd shim, which needs a shell to resolve.
					shell: Platform.isWin,
					windowsHide: true,
					stdio: ["pipe", "pipe", "pipe"],
				});
			} catch (e) {
				reject(e instanceof Error ? e : new Error(String(e)));
				return;
			}
			let stdout = "";
			let stderr = "";
			let settled = false;
			const finish = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				fn();
			};
			const onAbort = (): void => {
				child.kill();
				finish(() => reject(new Error("Grammar check cancelled.")));
			};
			const timer = window.setTimeout(() => {
				child.kill();
				finish(() => reject(new Error(`The Claude CLI did not answer within ${Math.round(request.timeoutMs / 1000)} seconds.`)));
			}, request.timeoutMs);
			signal?.addEventListener("abort", onAbort);

			child.stdout?.setEncoding("utf8");
			child.stderr?.setEncoding("utf8");
			child.stdout?.on("data", (chunk) => (stdout += chunk));
			child.stderr?.on("data", (chunk) => (stderr += chunk));
			child.on("error", (e) => finish(() => reject(new Error(`Could not start "${command}": ${e.message}`))));
			child.on("close", (code) =>
				finish(() => {
					if (code !== 0 && stdout.trim().length === 0) {
						reject(new Error(stderr.trim() || `The Claude CLI exited with code ${code ?? "unknown"}.`));
						return;
					}
					resolve(extractResult(stdout));
				}),
			);
			child.stdin?.on("error", () => undefined);
			child.stdin?.end(request.prompt);
		});
	}
}

/** `--output-format json` wraps the reply; fall back to the raw text if the envelope is missing. */
export function extractResult(stdout: string): string {
	const trimmed = stdout.trim();
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (typeof parsed === "object" && parsed !== null) {
			const o = parsed as Record<string, unknown>;
			if (o["is_error"] === true) throw new Error(typeof o["result"] === "string" ? o["result"] : "The Claude CLI reported an error.");
			if (typeof o["result"] === "string") return o["result"];
		}
	} catch (e) {
		if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
	}
	return trimmed;
}
