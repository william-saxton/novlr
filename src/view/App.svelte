<script lang="ts">
	let { pluginVersion }: { pluginVersion: string } = $props();
</script>

<div class="novelr-app">
	<div class="novelr-empty">
		<p>Novelr {pluginVersion}</p>
		<p class="novelr-muted">No project selected.</p>
	</div>
</div>
