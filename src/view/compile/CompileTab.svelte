<script lang="ts">
	import type { Project } from "../../model/types";

	let { project }: { project: Project } = $props();
</script>

<div class="novelr-empty">
	<p class="novelr-muted">Compile for {project.title} is not available yet.</p>
</div>
