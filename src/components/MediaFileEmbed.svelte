<script lang="ts">
	import appStore from "src/stores/appStore";
	import type { App, TFile } from "obsidian";
	import { get } from "svelte/store";
	import { onMount } from "svelte";

	let app: App = get(appStore.app);

	export let file: TFile;
	export let recomputeDimensions: () => void = () => {};

	let embedCreator = app.embedRegistry.getEmbedCreator(file);
	let containerEl: HTMLDivElement;
	let embed;

	$: if (file) setEmbed();

	function setEmbed() {
		embedCreator = app.embedRegistry.getEmbedCreator(file);

		if (embedCreator && containerEl) {
			// Clear and create a new element
			containerEl.innerHTML = '';
			let embedElement = containerEl.createDiv();

			embed = embedCreator({ app, containerEl: embedElement }, file, file.path);
			// @ts-ignore - Should work for everything
			embed.loadFile();
		}
	}

	onMount(() => {
		setEmbed();

		const videoEl = containerEl.getElementsByTagName("video")[0];
		if (videoEl) {
			videoEl.addEventListener("loadedmetadata", () => recomputeDimensions(), false);
		}
	});
</script>

{#if embedCreator}
    <div bind:this={containerEl} class="MC-embeded"></div>
{:else}
	<div class="MC-no-embed">{file.path}</div>	
{/if}

<style>
	:global(.MC-embeded) {
		max-height: inherit;
		line-height: 0;
		display: block;
	}
	:global(.MC-embeded div) {
		max-height: inherit;
		line-height: 0;
		display: flex;
	}
	:global(.MC-embeded div > *) {
		object-fit: contain;
		width: 100%;
	}
	:global(.MC-no-embed) {
		min-height: 200px;
		background-color: var(--tag-background);
		color: var(--tag-color);
	}
</style>
