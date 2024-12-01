<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
    import type MediaCompanion from "main";
	import pluginStore from "src/stores/pluginStore";
	import Query, { OrderByOptions, type QueryDetails } from "src/query";
	import { get } from "svelte/store";
	import { normalizePath, type App } from "obsidian";
	import appStore from "src/stores/appStore";
    import Masonry from "masonry-layout";
	import type MediaFile from "src/model/mediaFile";
    import imagesLoaded from "imagesloaded";
	import activeStore from "src/stores/activeStore";
	import type { Shape } from "src/model/types/shape";

    let plugin: MediaCompanion = get(pluginStore.plugin);
    let app: App = get(appStore.app);

    plugin.mutationHandler.addEventListener("file-created", (file) => {})

    type DisplayItem = {
        uri: string;
        file: MediaFile;
    }

    let searchDebounce: ReturnType<typeof setTimeout> | null = null;
    let searchColor: string = "";
    let searchFolders: string = "";
    let searchName: string = "";
    let searchTags: string = "";
    let searchFileTypes: string = "";
    let searchShapes: Shape[] = [];
    let orderBy: OrderByOptions = OrderByOptions.name;
    let orderIncreasing: boolean = true;

    let masonry: Masonry;
    let masonryContainer: HTMLDivElement;
    let scrollContainer: HTMLElement;
    let items: DisplayItem[] = [];
    let allItems: MediaFile[] = [];
    let query: Query = new Query(plugin.cache);

    let isLoading: boolean = false;
    let currentGroup: number = 0;
    const groupSize: number = 20;
    
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
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

    function onFileMoved(e: { detail: {file: MediaFile, oldPath: string} }) {
        let allFilesIndex = allItems.findIndex((item) => item.file.path === e.detail.oldPath);
        let itemsIndex = items.findIndex((item) => item.file.file.path === e.detail.oldPath);

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
            }
            else {
                if (allFilesIndex !== -1) {
                    allItems = allItems.splice(allFilesIndex, 1);
                }
                if (itemsIndex !== -1) {
                    items = items.splice(itemsIndex, 1);
                }
            }

            items = [...items];
            reloadMasonry();
        })
    }

    function onNewFile(e: { detail: MediaFile }) {
        // Check if the mediaFile is already in allItems or 

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

    function onFileRemoved(e: { detail: MediaFile }) {
        allItems = allItems.filter((item) => item !== e.detail);
        items = items.filter((item) => item.file !== e.detail);
        items = [...items];
        reloadMasonry();
    }

    function onFileChanged(e: { detail: MediaFile }) {
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
            }
            else {
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
        if (scrollContainer && masonryContainer) {

            if (resizeTimeout) clearTimeout(resizeTimeout);

            resizeTimeout = setTimeout(() => {
                // Need to do it twice here to adjust the image sizes and then
                // adjust the masonry layout to fit the new image sizes
                reloadMasonry();
                reloadMasonry();
            }, 50);
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
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!isScrollbarVisible()) {
            await loadNextGroup();
        }
        else {
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

        const nearBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 100;

        if (nearBottom && !isLoading) loadNextGroup();
    }

    function isScrollbarVisible() {
        return scrollContainer.scrollHeight > scrollContainer.clientHeight && scrollContainer.clientHeight != 0;
    }

    onMount(async () => {
        await plugin.cache.initialize();
        allItems = await query.getItems();

        masonry = new Masonry(masonryContainer, {
            transitionDuration: 0, // Turn off animations; Looks weird when adding items
            itemSelector: ".gallery-item",
            fitWidth: true,
        });

        await loadNextGroup();

        resizeObserver.observe(scrollContainer);

        scrollContainer.addEventListener("scroll", onScroll);
    });

    onDestroy(() => {
        scrollContainer.removeEventListener("scroll", onScroll);
        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        // @ts-ignore
        plugin.mutationHandler.removeEventListener("file-created", onNewFile);
        // @ts-ignore
        plugin.mutationHandler.removeEventListener("file-removed", onFileRemoved);
        // @ts-ignore
        plugin.mutationHandler.removeEventListener("file-changed", onFileChanged);
        // @ts-ignore
        plugin.mutationHandler.removeEventListener("file-moved", onFileChanged);
        // @ts-ignore
        plugin.mutationHandler.removeEventListener("sidecar-edited", onFileChanged);
    });

    function onFileClicked(file: MediaFile) {
        activeStore.file.set(file);
    }

    function onSearchChange() {
        // Debounce search
        if (searchDebounce) clearTimeout(searchDebounce);

        console.log(orderIncreasing);

        searchDebounce = setTimeout(async () => {
            items = [];
            currentGroup = 0;
            query = new Query(plugin.cache, {
                color: searchColor,
                folders: searchFolders.split(",").map((folder) => normalizePath(folder.trim())).filter((folder) => folder !== "" && folder !== "/"),
                name: searchName,
                tags: searchTags.split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""),
                fileTypes: searchFileTypes.split(",").map((fileType) => fileType.trim()).filter((fileType) => fileType !== ""),
                shape: searchShapes,
                dimensions: null, 
                orderBy: {
                    option: orderBy,
                    value: ""
                },
                orderIncreasing: orderIncreasing,
                hasFrontMatter: []
            });
            allItems = await query.getItems();
            await loadNextGroup();
        }, 300);
    }
</script>

<div class="media-companion-gallery-view-container">
{#await plugin.cache.initialize()}
    <h1 class="media-companion-gallery-loading">Loading cache...</h1>
{:then}
<div class="media-companion-gallery-search">
    <input type="color" name="Color" bind:value={searchColor} on:input={onSearchChange}> 
	<button on:click={()=>{searchColor = ""; onSearchChange()}}>x</button>
    <input type="text" placeholder="Name" bind:value={searchName} on:input={onSearchChange}>
    <input type="text" placeholder="Folders" bind:value={searchFolders} on:input={onSearchChange}>
    <input type="text" placeholder="Tags" bind:value={searchTags} on:input={onSearchChange}>
    <input type="text" placeholder="File types" bind:value={searchFileTypes} on:input={onSearchChange}>
    <select bind:value={orderBy} on:change={onSearchChange}>
        {#each Object.values(OrderByOptions) as option}
            <option value={option}>{option}</option>
        {/each}
    </select>
    <input type="checkbox" bind:checked={orderIncreasing} on:change={onSearchChange}>
</div>
<hr class="media-companion-gallery-search-hr">
<div class="gallery-container" bind:this={scrollContainer}>
    <div class="gallery-masonry" bind:this={masonryContainer}>
        {#each items as item}
            <button class="gallery-item" on:click={() => onFileClicked(item.file)}>
                <img src={item.uri} alt={item.file.file.name} loading="lazy" />
            </button>
        {/each}
    </div>
</div>
{/await}
</div>

<style>
    :global(.media-companion-gallery-view-container) {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    :global(.gallery-masonry) {
        display: block;
        width: 100%;
    }

    :global(.media-companion-gallery-search-hr) {
        margin: 4px;
    }

    :global(.media-companion-gallery-loading) {
        text-align: center;
    }

    :global(.gallery-container) {
        display: flex;
        justify-content: center;
        overflow: scroll;
        flex-grow: 1;
    }

    :global(button.gallery-item) {
        all: unset;
        padding: 5px;
        width: 20%;
        box-sizing: border-box;
    }

    :global(.gallery-item:focus img) {
        outline: 2px solid white;
    }

    :global(.gallery-item img) {
        width: 100%;
        height: auto;
        display: block;
    }
</style>
