<script lang="ts">
	import { Shape } from "src/model/types/shape";
	import Popup from "./Popup.svelte";
	import { onMount } from "svelte";
	import { setIcon } from "obsidian";

	export let icon = "proportions";
	export let text = "Size";
	export let updated: () => void = () => {};

	export let shape: Shape | null = null;
	export let minY: number | null = null;
	export let maxY: number | null = null;
	export let minX: number | null = null;
	export let maxX: number | null = null;

	let minYInput = minY !== null ? minY.toString() : "";
	let maxYInput = maxY !== null ? maxY.toString() : "";
	let minXInput = minX !== null ? minX.toString() : "";
	let maxXInput = maxX !== null ? maxX.toString() : "";

	$: active = shape != null || minY != null || maxY != null || minX != null || maxX != null;

	let squareButton: HTMLButtonElement;
	let horizontalButton: HTMLButtonElement;
	let verticalButton: HTMLButtonElement;
	let resetButton: HTMLButtonElement;

	function reset() {
		shape = null;
		minY = null;
		maxY = null;
		minX = null;
		maxX = null;
		
		minYInput = "";
		maxYInput = "";
		minXInput = "";
		maxXInput = "";

		updated();
	}

	function setShape(newShape: Shape | null) {
		shape = newShape;
		updated();
	}

	function handleInput(
		value: string | number,
		setter: (val: number | null) => void
	) {
		let num = 0;

		if (typeof value == "string") {
			if (value.trim() === "") {
				setter(null);
				return;
			} else {
				num = parseInt(value);
			}
		} else {
			num = value;
		}
		
		if (!isNaN(num) && num >= 0) {
			setter(num);
		}
	}
	
	function updateMinY() {
		handleInput(minYInput, (val) => {
			minY = val;
			updated();
		});
	}
	
	function updateMaxY() {
		handleInput(maxYInput, (val) => {
			maxY = val;
			updated();
		});
	}
	
	function updateMinX() {
		handleInput(minXInput, (val) => {
			minX = val;
			updated();
		});
	}
	
	function updateMaxX() {
		handleInput(maxXInput, (val) => {
			maxX = val;
			updated();
		});
	}

	onMount(() => {
		setIcon(squareButton, "square");
		setIcon(horizontalButton, "rectangle-horizontal");
		setIcon(verticalButton, "rectangle-vertical");
		setIcon(resetButton, "x");
	});
</script>

<Popup {icon} {text} {active} {reset}>
	<div class="MC-resolution-container">
		<div class="MC-shape-buttons">
			<button 
				bind:this={squareButton}
				class:MC-resolution-selected={shape === Shape.Square} 
				on:click={() => setShape(Shape.Square)} 
				title="Square">
			</button>
			<button 
				bind:this={horizontalButton}
				class:MC-resolution-selected={shape === Shape.Horizontal} 
				on:click={() => setShape(Shape.Horizontal)} 
				title="Horizontal">
			</button>
			<button
				bind:this={verticalButton}
				class:MC-resolution-selected={shape === Shape.Vertical} 
				on:click={() => setShape(Shape.Vertical)} 
				title="Vertical">
			</button>
			<button 
				bind:this={resetButton}
				class:MC-resolution-selected={shape === null}
				on:click={() => setShape(null)} 
				title="Remove shape filter">
			</button>
		</div>

		<div class="MC-dimension-inputs">
			<div class="MC-dimension-row">
				<div class="MC-input-group">
					<label for="minY">Min Height</label>
					<input 
						id="minY" 
						type="number" 
						min="0" 
						step="any" 
						bind:value={minYInput} 
						on:keyup={updateMinY}
						placeholder="Min"
					/>
				</div>
				<div class="MC-input-group">
					<label for="maxY">Max Height</label>
					<input 
						id="maxY" 
						type="number" 
						min="0" 
						step="any" 
						bind:value={maxYInput} 
						on:keyup={updateMaxY}
						placeholder="Max"
					/>
				</div>
			</div>
			<div class="MC-dimension-row">
				<div class="MC-input-group">
					<label for="minX">Min Width</label>
					<input 
						id="minX" 
						type="number" 
						min="0" 
						step="any" 
						bind:value={minXInput} 
						on:keyup={updateMinX}
						placeholder="Min"
					/>
				</div>
				<div class="MC-input-group">
					<label for="maxX">Max Width</label>
					<input 
						id="maxX" 
						type="number" 
						min="0" 
						step="any" 
						bind:value={maxXInput} 
						on:keyup={updateMaxX}
						placeholder="Max"
					/>
				</div>
			</div>
		</div>
	</div>
</Popup>

<style>
	:global(.MC-resolution-container) {
		padding: 8px;
	}

	:global(.MC-shape-buttons) {
		display: flex;
		justify-content: space-between;
		width: 100%;
	}

	:global(.MC-resolution-selected):not(.clickable-icon) {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	:global(.MC-dimension-inputs) {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
	}

	:global(.MC-dimension-row) {
		display: flex;
		gap: 8px;
		width: 100%;
	}

	:global(.MC-input-group) {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	:global(.MC-input-group label) {
		font-size: 0.8em;
		margin-bottom: 2px;
	}

	:global(.MC-input-group input) {
		width: 100%;
	}
</style>
