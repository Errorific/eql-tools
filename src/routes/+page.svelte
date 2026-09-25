<script lang="ts">
	import { base } from '$app/paths';
	import { tools } from '$lib/tools';
</script>

<h1>EverQuest Legends Tools</h1>
<p>A collection of browser tools for EverQuest Legends.</p>

<ul class="tools">
	{#each tools as tool}
		<li>
			<a class="tool-card" href={`${base}${tool.href}`}>
				<h2>{tool.name}</h2>
				<p>{tool.description}</p>
			</a>
		</li>
	{/each}
</ul>
