/** "just now", "5m ago", "3h ago", "2d ago", else a short date. Tolerates bad input. */
export function formatRelative(iso: string, now: Date = new Date()): string {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return iso || "";
	const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;
	return then.toLocaleDateString(undefined, { year: then.getFullYear() === now.getFullYear() ? undefined : "numeric", month: "short", day: "numeric" });
}
