<script lang="ts">
	import { OrderByOptions } from "src/query";
	import Popup from "./Popup.svelte";
	import { setIcon } from "obsidian";
	import { onMount } from "svelte";
	
	export let icon = "arrow-down-up";
	export let text = "Order";
	export let updated: () => void = () => {};

	export let option: OrderByOptions = OrderByOptions.random;
	export let orderIncreasing: boolean = true;

	let orderButton: HTMLButtonElement;
	let active = false;

	function swapState() {
		orderIncreasing = !orderIncreasing;

		setOrderIcon();

		updated();
	}

	function setOrderIcon() {
		if (orderIncreasing) {
			setIcon(orderButton, "move-down");
		} else {
			setIcon(orderButton, "move-up");
		}
	}

	onMount(() => {
		setOrderIcon();
	});
</script>

<Popup {icon} {text} {active}>
	<div class="MC-order-container">
		<select bind:value={option} on:change={updated}>
			{#each Object.values(OrderByOptions) as option}
				<option value={option}>{option.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase())}</option>
			{/each}
		</select>
		<button on:click={swapState} bind:this={orderButton}></button>
	</div>
</Popup>

<style>
	:global(.MC-order-container) {
		display: flex;
		align-items: center;
		margin: auto;
	}

	:global(.MC-order-container button):not(.clickable-icon) {
		box-shadow: none;
		border-radius: 0;
	}

	:global(.MC-order-container select) {
		box-shadow: none;
		border-radius: 0;
	}
</style>
