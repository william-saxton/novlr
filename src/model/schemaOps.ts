import { cloneSchema, typeById, validateSchema } from "./schema";
import { countByType, recomputePaths, walk } from "./tree";
import type { Project, Schema } from "./types";

export interface SchemaChangeResult {
	errors: string[];
}

/**
 * Check whether `next` can replace the project's schema. `renames` maps old type ids
 * to new ones (for ids edited in place). Pure; does not mutate.
 */
export function checkSchemaChange(project: Project, next: Schema, renames: Record<string, string>): string[] {
	const errors = validateSchema(next);
	const counts = countByType(project.root);
	for (const [oldId, n] of counts) {
		const newId = renames[oldId] ?? oldId;
		const before = typeById(project.schema, oldId);
		const after = typeById(next, newId);
		if (!after) {
			errors.push(`Type "${oldId}" is used by ${n} node${n === 1 ? "" : "s"} and cannot be removed.`);
			continue;
		}
		if (before && before.kind !== after.kind) {
			errors.push(`Type "${oldId}" is used by ${n} node${n === 1 ? "" : "s"}; its kind cannot change from ${before.kind} to ${after.kind}.`);
		}
	}
	const root = typeById(next, next.rootType);
	if (root && root.kind === "container") {
		const rootId = renames[project.root.typeId] ?? project.root.typeId;
		if (rootId !== next.rootType) {
			// Root type changed: allowed, the root node simply takes the new type.
		}
	}
	return errors;
}

/** Apply a validated schema change: rewrite node type ids and install the schema. Mutates `project`. */
export function applySchemaChange(project: Project, next: Schema, renames: Record<string, string>): void {
	walk(project.root, (node) => {
		const renamed = renames[node.typeId];
		if (renamed) node.typeId = renamed;
	});
	project.schema = cloneSchema(next);
	project.root.typeId = next.rootType;
	recomputePaths(project.root, null);
}

/** Types in the preset that the project's nodes require but the preset lacks. */
export function missingTypesForPreset(project: Project, preset: Schema): string[] {
	const counts = countByType(project.root);
	const missing: string[] = [];
	for (const id of counts.keys()) {
		if (id === project.root.typeId) continue;
		const def = typeById(preset, id);
		const current = typeById(project.schema, id);
		if (!def || (current && def.kind !== current.kind)) missing.push(id);
	}
	return missing;
}
