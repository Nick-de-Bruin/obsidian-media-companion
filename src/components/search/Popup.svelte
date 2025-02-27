<script lang="ts">
	import { setIcon } from "obsidian";
	import { onMount, onDestroy } from "svelte";

	export let show = false;
	export let active = false;
	export let icon = "info";
	export let text = "button";
	export let activeColor: string | null = null;
	export let reset: () => void = () => {};

	let iconElement: HTMLSpanElement;
	let buttonElement: HTMLButtonElement;
	let popupElement: HTMLDivElement;
	let resetIconElement: HTMLSpanElement;

	let popupTop = 0;
	let popupLeft = 0;

	function handleClickOutside(event: MouseEvent) {
		if (show && !buttonElement.contains(event.target as Node) &&
			!popupElement.contains(event.target as Node)) {
			show = false;
		}
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (show && event.key === 'Escape') {
			show = false;
		}
	}

	function handleResetClick(event: MouseEvent) {
		event.stopPropagation();
		reset();
	}

	onMount(() => {
		setIcon(iconElement, icon);
		setIcon(resetIconElement, "x");
		window.addEventListener('click', handleClickOutside);
		window.addEventListener('keydown', handleKeydown);
	});
	
	onDestroy(() => {
		window.removeEventListener('click', handleClickOutside);
		window.removeEventListener('keydown', handleKeydown);
	});

	function openPopup(): void {
		show = true;
		positionPopup();
		// Do it a second time when the width is > 0
		// in case we're on the right edge
		setTimeout(positionPopup, 0);
	}

	function positionPopup(): void {
		if (!popupElement || !buttonElement) return;

		const containerPadding = 5;
		
		const buttonRect = buttonElement.getBoundingClientRect();
		const popupRect = popupElement.getBoundingClientRect();
		
		const parentElement = buttonElement.offsetParent || buttonElement.parentElement;
		const parentRect = parentElement!.getBoundingClientRect();
		
		let top = buttonRect.bottom - parentRect.top;
		let left = buttonRect.left - parentRect.left;
		
		const containerWidth = parentElement instanceof HTMLElement ? 
			parentElement.clientWidth : window.innerWidth;
		
		if (left + popupRect.width > containerWidth - containerPadding) {

			// Align popup right edge with button right edge or container edge
			if (buttonRect.right + left > containerWidth - containerPadding) {
				left = containerWidth - containerPadding - popupRect.width;
			} else {
				left = (buttonRect.right - parentRect.left) - popupRect.width;
			}
		}
		
		popupTop = top;
		popupLeft = left;
	}
</script>

<button 
	bind:this={buttonElement} 
	on:click={openPopup} 
	class="MC-popup-trigger" 
	class:MC-popup-active={active}
	style="{activeColor && active ? `background-color: ${activeColor};` : ""}">
	<span bind:this={iconElement} class="MC-icon-container"></span>{text}
	<div hidden={!active}>
	<button 
		class="MC-reset-button" 
		on:click={handleResetClick} 
		aria-label="Reset">
		<span bind:this={resetIconElement} class="MC-icon-container"></span>
	</button>
	</div>
</button>

<div 
	bind:this={popupElement} 
	class="MC-popup" 
	style="top: {popupTop}px; left: {popupLeft}px;"
	hidden={!show}>
	<slot />
</div>

<style>
	:global(.MC-popup-trigger):not(.clickable-icon) {
		cursor: var(--cursor-link);
		padding: var(--size-2-1) var(--size-2-3);
		position: relative;
		box-shadow: none;
		margin-top: 5px;
	}

	:global(.MC-popup-active):not(.clickable-icon) {
		background-color: var(--color-accent);
		color: var(--text-on-accent);
	}

	:global(.MC-icon-container svg) {
		display: inline-block;
		vertical-align: middle;
		margin-right: 5px;
	}

	:global(.MC-popup) {
		position: absolute;
		background: var(--background-secondary);
		border-radius: var(--input-radius);
		z-index: var(--layer-modal);
		min-width: 150px; /* Ensure some width */
		min-height: 2em;
		max-width: 60%; /* Constrain max width for mobile */
		margin-top: 2px;
		border: 1px solid var(--interactive-normal);
	}

	:global(.MC-reset-button) {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 16px;
		height: 16px;
		padding: 0;
		background-color: var(--background-modifier-error);
		color: var(--text-on-accent);
		border-radius: 50%;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		box-shadow: none;
		cursor: pointer;
	}

	:global(.MC-reset-button:hover) {
		background-color: var(--background-modifier-error-hover);
	}

	:global(.MC-reset-button .MC-icon-container svg) {
		width: 14px;
		height: 14px;
		margin: 2px;
		display: inline-block;
		vertical-align: middle;
	}
</style>
