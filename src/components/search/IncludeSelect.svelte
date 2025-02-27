<script lang="ts">
	import Popup from "./Popup.svelte";

	export let options: [string, number][] = [];
	export let included: string[] = [];
	export let excluded: string[] = [];
	export let icon = "info";
	export let text = "include";
	export let updated: () => void = () => {};

	let active: boolean;
	let searchTerm = "";
	let containerWidth: number = 0;

	let container: HTMLDivElement;

	$: active = included.length > 0 || excluded.length > 0;
	$: filteredOptions = searchTerm 
		? options.filter(([opt]) => opt.toLowerCase().includes(searchTerm.toLowerCase())) 
		: options;

	function toggleInclude(option: string) {
		if (included.includes(option)) {
			included = included.filter(o => o !== option);
		} else {
			included = [...included, option];
			excluded = excluded.filter(o => o !== option);
		}
		updated();
	}

	function toggleExclude(option: string) {
		if (excluded.includes(option)) {
			excluded = excluded.filter(o => o !== option);
		} else {
			excluded = [...excluded, option];
			included = included.filter(o => o !== option);
		}
		updated();
	}
	
	$: if (filteredOptions && filteredOptions.length > 0) {
		setTimeout(() => {
			if (container && container.clientWidth > containerWidth) containerWidth = container.clientWidth;
		}, 0);
	}

	function reset() {
		included = [];
		excluded = [];
		updated();
	}
</script>

<Popup {icon} {text} {active} {reset}>
	<div
		bind:this={container} 
		class="MC-include-container" 
		style={containerWidth ? `min-width: ${containerWidth}px` : ''}>
		<div>
			<input 
				type="text" 
				placeholder="Search..." 
				bind:value={searchTerm}
				class="MC-include-search"
			/>
		</div>

		<div class="MC-include-options-list">
			{#each filteredOptions as [option, count]}
				<div class="MC-include-option-row">
					<span class="MC-include-option-text">{option}</span>
					<span class="MC-include-option-count">{count}</span>
					<div class="MC-include-option-buttons">
						<button 
							class="MC-include-button" 
							class:MC-include-active={included.includes(option)}
							on:click={() => toggleInclude(option)} 
							aria-label="Include"
						>+</button>
						<button 
							class="MC-include-button" 
							class:MC-include-active={excluded.includes(option)}
							on:click={() => toggleExclude(option)} 
							aria-label="Exclude"
						>-</button>
					</div>
				</div>
			{/each}
			{#if filteredOptions.length === 0}
				<div class="MC-include-no-results">No results found</div>
			{/if}
		</div>
	</div>
</Popup>

<style>	
	:global(.MC-include-container) {
		width: 100%;
		min-width: 250px; /* Set a minimum width */
	}
	
	:global(.MC-include-search) {
		width: 100%;
	}
	
	:global(.MC-include-options-list) {
		max-height: min(300px, 50vh);
		overflow-y: auto;
		padding: 0px 5px;
		width: 100%;
		box-sizing: border-box;
	}
	
	:global(.MC-include-option-row) {
		display: flex;
		align-items: center;
		padding: 4px 0;
		border-bottom: 1px solid var(--background-modifier-border-hover);
		flex-wrap: nowrap;
		min-height: 32px;
	}
	
	:global(.MC-include-option-text) {
		flex-grow: 1;
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	:global(.MC-include-option-count) {
		margin: 0 8px;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	
	:global(.MC-include-option-buttons) {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}
	
	:global(.MC-include-button):not(.clickable-icon) {
		width: 24px;
		height: 24px;
		min-width: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: none;
		box-shadow: none;
	}
	
	:global(.MC-include-button.MC-include-active):not(.clickable-icon) {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	
	:global(.MC-include-no-results) {
		padding: 10px 0;
		text-align: center;
		color: var(--text-muted);
	}
	
	/* Media query for smaller screens */
	@media screen and (max-width: 480px) {
		:global(.MC-include-options-list) {
			max-height: min(250px, 60vh);
			padding: 0px 2px;
		}
		
		:global(.MC-include-option-row) {
			padding: 6px 0;
		}
		
		:global(.MC-include-button):not(.clickable-icon) {
			width: 30px;
			height: 30px;
			min-width: 30px;
		}
	}
</style>

