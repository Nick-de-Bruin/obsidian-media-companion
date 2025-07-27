<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import type MediaCompanion from "main";
	import pluginStore from "src/stores/pluginStore";
	import Query, { OrderByOptions } from "src/query";
	import { get } from "svelte/store";
	import { Platform, setIcon, type App } from "obsidian";
	import appStore from "src/stores/appStore";
	import Masonry from "masonry-layout";
	import type MediaFile from "src/model/mediaFile";
	import imagesLoaded from "imagesloaded";
	import activeStore from "src/stores/activeStore";
	import type { Shape } from "src/model/types/shape";
	import MediaFileEmbed from "./MediaFileEmbed.svelte";
	import { debounce } from "obsidian";
	import IncludeSelect from "./search/IncludeSelect.svelte";
	import ColourPicker from "./search/ColourPicker.svelte";
	import Resolution from "./search/Resolution.svelte";
	import Order from "./search/Order.svelte";
	import DateRange from "./search/DateRange.svelte";

	let plugin: MediaCompanion = get(pluginStore.plugin);
	let app: App = get(appStore.app);

	type DisplayItem = {
		uri: string;
		file: MediaFile;
	};

	let possiblePaths: [string, number][] = [];
	let includedPaths: string[] = [];
	let excludedPaths: string[] = [];
	let possibleTags: [string, number][] = [];
	let includedTags: string[] = [];
	let excludedTags: string[] = [];
	let possibleExtensions: [string, number][] = [];
	let includedExtensions: string[] = [];
	let excludedExtensions: string[] = [];
	let color: string | null = null;
	let shape: Shape | null = null;
	let minX: number | null = null;
	let maxX: number | null = null;
	let minY: number | null = null;
	let maxY: number | null = null;
	let smtime: string | null = null;
	let emtime: string | null = null;
	let sctime: string | null = null;
	let ectime: string | null = null;

	let elementSize: number = 200;
	let minElementSize: number = 100;
	let maxElementSize: number = 500;
	let orderBy: OrderByOptions = OrderByOptions.name;
	let orderIncreasing: boolean = true;

	let masonry: Masonry;
	let masonryContainer: HTMLDivElement;
	let scrollContainer: HTMLElement;
	let items: DisplayItem[] = [];
	let allItems: MediaFile[] = [];
	let query: Query = new Query(plugin.cache);

	let sizerMinus: HTMLDivElement;
	let sizerPlus: HTMLDivElement;

	let isLoading: boolean = false;
	let currentGroup: number = 0;
	const groupSize: number = 20;

	const resizeObserver = new ResizeObserver(() => onResize());

	// @ts-ignore
	plugin.mutationHandler.addEventListener("file-created", onNewFile);
	// @ts-ignore
	plugin.mutationHandler.addEventListener("file-removed", onFileRemoved);
	// @ts-ignore
	plugin.mutationHandler.addEventListener("file-changed", onFileChanged);
	// @ts-ignore
	plugin.mutationHandler.addEventListener("file-moved", onFileMoved);
	// @ts-ignore
	plugin.mutationHandler.addEventListener("sidecar-edited", onFileChanged);

	function getDisplayItem(file: MediaFile): DisplayItem {
		return {
			uri: app.vault.getResourcePath(file.file),
			file: file,
		};
	}

	// Checks whether the file is already in the query and whether it should be depending
	// on the query parameters. Will remove and/or add the file where needed, and reload
	// the masonry
	function onFileMoved(e: { detail: { file: MediaFile; oldPath: string } }) {
		updateSearchPossibilities();

		let allFilesIndex = allItems.findIndex(
			(item) => item.file.path === e.detail.oldPath,
		);
		let itemsIndex = items.findIndex(
			(item) => item.file.file.path === e.detail.oldPath,
		);

		query.testFile(e.detail.file).then((res) => {
			if (res) {
				if (allFilesIndex === -1) {
					allItems = [e.detail.file, ...allItems];
				} else {
					allItems[allFilesIndex] = e.detail.file;
				}
				if (itemsIndex === -1) {
					items = [getDisplayItem(e.detail.file), ...items];
				} else {
					items[itemsIndex] = getDisplayItem(e.detail.file);
				}
			} else {
				if (allFilesIndex !== -1) {
					allItems = allItems.splice(allFilesIndex, 1);
				}
				if (itemsIndex !== -1) {
					items = items.splice(itemsIndex, 1);
				}
			}

			items = [...items];
			reloadMasonry();
		});
	}

	function onNewFile(e: { detail: MediaFile }) {
		updateSearchPossibilities();

		// Check if the mediaFile is already in allItems or should be added
		if (query) {
			query.testFile(e.detail).then((res) => {
				if (res) {
					allItems = [e.detail, ...allItems];
					items = [getDisplayItem(e.detail), ...items];
					reloadMasonry();
				}
			});
		}
	}

	// Removes the file if it's in our current list and then reloads the masonry
	function onFileRemoved(e: { detail: MediaFile }) {
		updateSearchPossibilities();

		allItems = allItems.filter((item) => item !== e.detail);
		items = items.filter((item) => item.file !== e.detail);
		items = [...items];
		reloadMasonry();
	}

	// Same as onFileMoved; Checks the new file according to the query and removes/adds it
	// as needed
	function onFileChanged(e: { detail: MediaFile }) {
		updateSearchPossibilities();

		let allFilesIndex = allItems.findIndex((item) => item === e.detail);
		let itemsIndex = items.findIndex((item) => item.file === e.detail);

		query.testFile(e.detail).then((res) => {
			if (res) {
				if (allFilesIndex === -1) {
					allItems = [e.detail, ...allItems];
				}
				if (itemsIndex === -1) {
					items = [getDisplayItem(e.detail), ...items];
				}
			} else {
				if (allFilesIndex !== -1) {
					allItems = allItems.splice(allFilesIndex, 1);
				}
				if (itemsIndex !== -1) {
					items = items.splice(itemsIndex, 1);
				}
			}

			items = [...items];
			reloadMasonry();
		});
	}

	function onResize() {
		// Third: Make sure the masonryContainer is visible
		if (
			scrollContainer &&
			masonryContainer &&
			masonryContainer.offsetParent !== null
		) {
			reloadMasonry();
			reloadMasonry();

			if (!isScrollbarVisible()) {
				loadNextGroup().then(() => {});
			}
		}
	}

	async function loadNextGroup() {
		isLoading = true;

		const startIndex = currentGroup * groupSize;
		const endIndex = startIndex + groupSize;

		if (startIndex >= allItems.length) return; // Don't bother with isLoading, we're done

		const nextGroup = allItems.slice(startIndex, endIndex);

		// Turn nextGroup into a object with { uri, file }
		// This is needed for the masonry layout
		let formattedGroup = nextGroup.map((item) => {
			return getDisplayItem(item);
		});

		items = [...items, ...formattedGroup];

		await tick();

		reloadMasonry();

		currentGroup++;

		// Small timeout to prevent loading everything instantly
		// Also needed for `isScrollbarVisible` to work correctly
		await new Promise((resolve) => setTimeout(resolve, 50));

		if (!isScrollbarVisible()) {
			// Don't load in things too fast
			await new Promise((resolve) => setTimeout(resolve, 500));
			await loadNextGroup();
		} else {
			isLoading = false;
		}
	}

	function reloadMasonry() {
		if (masonry && masonryContainer) {
			imagesLoaded(masonryContainer, () => {
				// @ts-ignore
				masonry.reloadItems();
				// @ts-ignore
				masonry.layout();
			});
		}
	}

	function onScroll() {
		if (!scrollContainer) return;

		const nearBottom =
			scrollContainer.scrollTop + scrollContainer.clientHeight >=
			scrollContainer.scrollHeight - 100;

		if (nearBottom && !isLoading) loadNextGroup();
	}

	function isScrollbarVisible() {
		return (
			scrollContainer.scrollHeight > scrollContainer.clientHeight &&
			scrollContainer.clientHeight != 0
		);
	}

	function updateSearchPossibilities() {
		possiblePaths = [...Object.entries(plugin.cache.paths)];
		possiblePaths.sort((a, b) => a[0].localeCompare(b[0]));
		possibleTags = [...Object.entries(plugin.cache.tags)];
		possibleTags.sort((a, b) => a[0].localeCompare(b[0]));
		possibleExtensions = [...Object.entries(plugin.cache.extensions)];
		possibleExtensions.sort((a, b) => a[0].localeCompare(b[0]));
	}

	let pinchInitialDistance = 0;
	let pinchInitialSize = 0;

	function getTouchDistance(e: TouchEvent) {
		const dx = e.touches[0].clientX - e.touches[1].clientX;
		const dy = e.touches[0].clientY - e.touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			pinchInitialDistance = getTouchDistance(e);
			pinchInitialSize = elementSize;
			e.preventDefault();
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2) {
			const currentDistance = getTouchDistance(e);

			if (pinchInitialDistance > 0) {
				const scale = currentDistance / pinchInitialDistance;
				elementSize = Math.min(
					maxElementSize,
					Math.max(
						minElementSize,
						Math.round(pinchInitialSize * scale),
					),
				);

				reloadMasonry();
				e.preventDefault();
			}
		}
	}

	function onTouchEnd() {
		pinchInitialDistance = 0;
	}

	onMount(async () => {
		await plugin.cache.initialize();
		allItems = await query.getItems();

		if (sizerMinus && sizerPlus) {
			setIcon(sizerMinus, "minus");
			setIcon(sizerPlus, "plus");
		}

		updateSearchPossibilities();

		masonry = new Masonry(masonryContainer, {
			transitionDuration: 0, // Turn off animations; Looks weird when adding items
			columnWidth: ".MC-gallery-sizer",
			itemSelector: ".MC-gallery-item",
			fitWidth: true,
		});

		await loadNextGroup();

		resizeObserver.observe(scrollContainer);

		scrollContainer.addEventListener("scroll", onScroll);
		scrollContainer.addEventListener("touchstart", onTouchStart, {
			passive: false,
		});
		scrollContainer.addEventListener("touchmove", onTouchMove, {
			passive: false,
		});
		scrollContainer.addEventListener("touchend", onTouchEnd);
	});

	onDestroy(() => {
		scrollContainer.removeEventListener("scroll", onScroll);
		scrollContainer.removeEventListener("touchstart", onTouchStart);
		scrollContainer.removeEventListener("touchmove", onTouchMove);
		scrollContainer.removeEventListener("touchend", onTouchEnd);

		if (resizeObserver) {
			resizeObserver.disconnect();
		}

		// @ts-ignore
		plugin.mutationHandler.removeEventListener("file-created", onNewFile);
		// @ts-ignore
		plugin.mutationHandler.removeEventListener(
			"file-removed",
			onFileRemoved,
		);
		// @ts-ignore
		plugin.mutationHandler.removeEventListener(
			"file-changed",
			onFileChanged,
		);
		// @ts-ignore
		plugin.mutationHandler.removeEventListener("file-moved", onFileChanged);
		// @ts-ignore
		plugin.mutationHandler.removeEventListener(
			"sidecar-edited",
			onFileChanged,
		);
	});

	function onFileClicked(file: MediaFile) {
		activeStore.file.set(file);
	}

	function onFileDoubleClicked(file: MediaFile) {
		if (file) {
			const pt = file.file.path;
			app.openWithDefaultApp(pt);
		}
	}

	let searchDebounce = debounce(
		async () => {
			items = [];
			currentGroup = 0;

			query = new Query(plugin.cache, {
				name: "",
				folders: {
					included: includedPaths,
					excluded: excludedPaths,
				},
				tags: {
					included: includedTags,
					excluded: excludedTags,
				},
				fileTypes: {
					included: includedExtensions,
					excluded: excludedExtensions,
				},
				shape: shape,
				color: color,
				dimensions: {
					minWidth: minX,
					maxWidth: maxX,
					minHeight: minY,
					maxHeight: maxY,
				},
				date: {
					startCtime: sctime ? new Date(sctime) : null,
					endCtime: ectime ? new Date(ectime) : null,
					startMtime: smtime ? new Date(smtime) : null,
					endMtime: emtime ? new Date(emtime) : null,
				},
				orderBy: orderBy,
				orderIncreasing: orderIncreasing,
			});
			allItems = await query.getItems();
			await loadNextGroup();
			reloadMasonry();
		},
		300,
		true,
	);

	function onSearchChange() {
		searchDebounce();
	}
</script>

<div class="MC-gallery-view-container">
	{#await plugin.cache.initialize()}
		<h1 class="MC-gallery-loading">Loading cache...</h1>
	{:then}
		<div class="MC-search-controls-scroll-wrapper">
			<div class="MC-search-controls-container">
				<div class="MC-gallery-search">
					<ColourPicker bind:color updated={onSearchChange} />
					<IncludeSelect
						options={possiblePaths}
						bind:included={includedPaths}
						bind:excluded={excludedPaths}
						icon="folder"
						text="Paths"
						updated={onSearchChange}
					/>
					<IncludeSelect
						options={possibleTags}
						bind:included={includedTags}
						bind:excluded={excludedTags}
						icon="hash"
						text="Tags"
						updated={onSearchChange}
					/>
					<IncludeSelect
						options={possibleExtensions}
						bind:included={includedExtensions}
						bind:excluded={excludedExtensions}
						icon="file-question"
						text="Extension"
						updated={onSearchChange}
					/>
					<Resolution
						bind:shape
						bind:minX
						bind:maxX
						bind:minY
						bind:maxY
						updated={onSearchChange}
					/>
					<DateRange
						bind:smtime
						bind:emtime
						bind:sctime
						bind:ectime
						updated={onSearchChange}
					/>
					{#if Platform.isMobile}
						<Order
							bind:option={orderBy}
							bind:orderIncreasing
							updated={onSearchChange}
						/>
					{/if}
				</div>
				{#if !Platform.isMobile}
					<div class="MC-gallery-controls-right">
						<div
							class="MC-gallery-sizer-icon"
							bind:this={sizerMinus}
						>
							<span></span>
						</div>
						<input
							class="MC-gallery-sizer"
							type="range"
							bind:value={elementSize}
							min={minElementSize}
							max={maxElementSize}
							on:input={() => reloadMasonry()}
						/>
						<div
							class="MC-gallery-sizer-icon"
							bind:this={sizerPlus}
						>
							<span></span>
						</div>
						<div class="MC-gallery-empty"></div>
						<Order
							bind:option={orderBy}
							bind:orderIncreasing
							updated={onSearchChange}
						/>
					</div>
				{/if}
			</div>
		</div>
		<hr class="MC-gallery-search-hr" />
		<div class="MC-gallery-container" bind:this={scrollContainer}>
			<div class="MC-gallery-masonry" bind:this={masonryContainer}>
				<div
					class="MC-gallery-sizer"
					style="width: {elementSize}px;"
				></div>
				{#each items as item}
					<button
						class="MC-gallery-item"
						style="width: {elementSize}px;"
						on:click={() => onFileClicked(item.file)}
						on:contextmenu={() => onFileDoubleClicked(item.file)}
					>
						<MediaFileEmbed
							file={item.file.file}
							recomputeDimensions={() => reloadMasonry()}
						/>
					</button>
				{/each}
			</div>
		</div>
	{/await}
</div>

<style>
	:global(.MC-collapse-button) {
		padding: 5px;
	}

	:global(.MC-gallery-masonry) {
		display: block;
		width: 100%;
	}

	:global(.MC-gallery-search-hr) {
		margin: 4px;
	}

	:global(.MC-search-controls-container) {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		flex-shrink: 0;
	}

	:global(.MC-gallery-controls-right) {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 0 10px;
	}

	:global(.MC-gallery-search) {
		display: flex;
		align-items: stretch;
		flex-wrap: wrap;
		gap: 5px;
		padding: 0 10px;
	}

	:global(.MC-gallery-empty) {
		padding: 5px;
	}

	:global(.MC-gallery-controls-right .MC-gallery-sizer-icon) {
		display: flex;
		align-items: center;
	}

	:global(.MC-gallery-view-container) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	:global(.MC-gallery-loading) {
		text-align: center;
	}

	:global(.MC-gallery-container) {
		position: relative;
		display: flex;
		width: 100%;
		justify-content: center;
		overflow-y: scroll;
		flex-grow: 1;
		padding: 0 !important;
	}

	:global(button.MC-gallery-item) {
		all: unset;
		padding: 0px;
		box-sizing: border-box;
		background-color: var(--background-primary);
	}

	:global(.MC-gallery-item div) {
		border: 2px solid #00000000;
	}

	:global(.MC-gallery-item:focus div) {
		border: 2px solid var(--interactive-accent);
		border-radius: 2px;
	}

	/* Used in gallery-view.ts */
	:global(.MC-gallery-page-container) {
		padding-bottom: 0 !important;
	}
</style>
