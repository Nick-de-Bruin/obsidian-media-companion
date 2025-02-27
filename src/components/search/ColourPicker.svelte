<script lang="ts">
	import Popup from "./Popup.svelte";
	import { onMount, onDestroy } from "svelte";

	export let icon = "palette";
	export let text = "Color";
	export let color: string | null = null;
	export let updated: () => void = () => {};
	
	$: active = color !== null;

	function reset() {
		color = null;
		updated();
	}

	let hue = 0;
	let saturation = 1;
	let value = 1;

	let colorSquare: HTMLDivElement;
	let hueSlider: HTMLDivElement;

	let isDraggingSquare = false;
	let isDraggingHue = false;

	onMount(() => {
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	});

	function handleSquareDown(event: MouseEvent) {
		isDraggingSquare = true;
		updateColorFromSquare(event);
	}

	function handleHueDown(event: MouseEvent) {
		isDraggingHue = true;
		updateHueFromSlider(event);
	}

	function handleMouseMove(event: MouseEvent) {
		if (isDraggingSquare) {
			updateColorFromSquare(event);
		} else if (isDraggingHue) {
			updateHueFromSlider(event);
		}
	}

	function handleMouseUp() {
		isDraggingSquare = false;
		isDraggingHue = false;
	}

	function updateColorFromSquare(event: MouseEvent) {
		if (!colorSquare) return;
		
		const rect = colorSquare.getBoundingClientRect();
		
		saturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		value = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
				
		updateColor();
	}

	function updateHueFromSlider(event: MouseEvent) {
		if (!hueSlider) return;
		
		const rect = hueSlider.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		
		hue = Math.round(x * 360);
		
		updateColor();
	}

	// Adapted from: https://stackoverflow.com/a/54024653
	function hsv2rgb(h: number, s: number, v: number) 
	{
	  	let f = (n: number,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);

		let r = Math.round(f(5) * 255);
		let g = Math.round(f(3) * 255);
		let b = Math.round(f(1) * 255);

		// From: https://stackoverflow.com/a/5624139
		function componentToHex(c: number): string {
  			var hex = c.toString(16);
  			return hex.length == 1 ? "0" + hex : hex;
		}
		
		return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
	}
	
	function updateColor() {
		color = hsv2rgb(hue, saturation, value);
		updated();
	}
</script>

<Popup {icon} {text} {active} {reset} activeColor={color}>
	<div class="color-picker-container">
		<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="color-square-wrapper">
			<div 
				class="color-square"
				bind:this={colorSquare}
				on:mousedown|preventDefault={handleSquareDown}
				style={`--hue: ${hue}`}>
				<div class="white-gradient"></div>
				<div class="black-gradient"></div>
				
				<div 
					class="color-indicator"
					style={`left: ${saturation * 100}%; top: ${100 - value * 100}%`}
				></div>
			</div>
		</div>
		
		<div class="hue-slider-wrapper">
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div 
				class="hue-slider"
				bind:this={hueSlider}
				on:mousedown|preventDefault={handleHueDown}>
				<div 
					class="hue-indicator"
					style={`left: ${hue / 360 * 100}%`}
				></div>
			</div>
		</div>
	</div>
</Popup>

<style>
	:global(.color-square-wrapper) {
		position: relative;
		width: 200px;
		height: 200px;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid rgba(0, 0, 0, 0.2);
	}

	:global(.color-square) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		background-color: hsl(var(--hue), 100%, 50%);
	}
	
	:global(.white-gradient) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(to right, white, transparent);
	}
	
	:global(.black-gradient) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(to bottom, transparent, black);
	}

	:global(.color-indicator) {
		position: absolute;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	:global(.hue-slider-wrapper) {
		position: relative;
		width: 200px;
		height: 20px;
	}

	:global(.hue-slider) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		background: linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red);
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid rgba(0, 0, 0, 0.2);
	}

	:global(.hue-indicator) {
		position: absolute;
		width: 5px;
		height: 100%;
		border: 2px solid white;
		box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
		transform: translate(-50%, -50%);
		pointer-events: none;
		top: 50%;
	}
</style>
