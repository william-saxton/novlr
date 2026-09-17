import { derived, get, writable } from "svelte/store";
import type { Project } from "../model/types";

/** All discovered projects keyed by index note path. */
export const projects = writable<Map<string, Project>>(new Map());

/** Index path of the project shown in the pane. */
export const selectedIndexPath = writable<string | null>(null);

export const currentProject = derived([projects, selectedIndexPath], ([$projects, $selected]) => {
	if ($selected && $projects.has($selected)) return $projects.get($selected) ?? null;
	return null;
});

export const projectList = derived(projects, ($projects) =>
	[...$projects.values()].sort((a, b) => a.title.localeCompare(b.title)),
);

/** Replace the map so Svelte subscribers re-run. */
export function setProject(project: Project): void {
	projects.update((map) => {
		const next = new Map(map);
		next.set(project.indexPath, project);
		return next;
	});
}

export function removeProject(indexPath: string): void {
	projects.update((map) => {
		if (!map.has(indexPath)) return map;
		const next = new Map(map);
		next.delete(indexPath);
		return next;
	});
	if (get(selectedIndexPath) === indexPath) selectedIndexPath.set(null);
}

/** Mutate a project in place and notify subscribers. Returns false when the project is unknown. */
export function updateProject(indexPath: string, mutate: (project: Project) => void): boolean {
	const map = get(projects);
	const project = map.get(indexPath);
	if (!project) return false;
	mutate(project);
	projects.set(new Map(map));
	return true;
}

/** Project whose root folder contains the given vault path, if any (deepest root wins). */
export function projectContaining(path: string): Project | undefined {
	let best: Project | undefined;
	for (const p of get(projects).values()) {
		const inside = p.rootFolder === "" || path === p.rootFolder || path.startsWith(p.rootFolder + "/");
		if (inside && (!best || p.rootFolder.length > best.rootFolder.length)) best = p;
	}
	return best;
}
