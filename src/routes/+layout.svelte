<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { tools } from '$lib/tools';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<a class="brand" href={`${base}/`}>EverQuest Legends Tools</a>
	<nav>
		{#each tools as tool}
			<a
				href={`${base}${tool.href}`}
				aria-current={page.url.pathname === `${base}${tool.href}` ? 'page' : undefined}
			>
				{tool.name}
			</a>
		{/each}
	</nav>
</header>

<main>
	{@render children()}
</main>
