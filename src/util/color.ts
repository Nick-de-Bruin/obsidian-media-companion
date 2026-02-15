/**
 * Converts RGB values (0-255) to HSL color space.
 * Based on: https://gist.github.com/vahidk/05184faf3d92a0aa1b46aeaa93b07786
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns [hue (0-360), saturation (0-1), lightness (0-1)]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d === 0) h = 0;
	else if (max === r) h = ((g - b) / d) % 6;
	else if (max === g) h = (b - r) / d + 2;
	else if (max === b) h = (r - g) / d + 4;
	const l = (min + max) / 2;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	return [h * 60, s, l];
}

/**
 * Converts a hex color string to RGB values.
 * @param hex A hex color string like "#ff0000"
 * @returns [r, g, b] each 0-255, or null if invalid
 */
export function hexToRgb(hex: string): [number, number, number] | null {
	const match = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
	if (!match) return null;
	return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/**
 * Calculates weighted color distance between a target HSL color and an array
 * of extracted image colors. Uses hue-wraparound-aware distance.
 * @param targetH Target hue (0-360)
 * @param targetS Target saturation (0-1)
 * @param targetL Target lightness (0-1)
 * @param colors Array of extracted color objects with {h, s, l, area}
 *   where h is 0-1, s is 0-1, l is 0-1, area is 0-1
 * @param threshold Maximum acceptable distance (default 0.5)
 * @returns Whether the colors are within the threshold
 */
export function isColorWithinThreshold(
	targetH: number,
	targetS: number,
	targetL: number,
	colors: { h: number; s: number; l: number; area: number }[],
	threshold = 0.5
): boolean {
	if (!colors || !Array.isArray(colors) || colors.length === 0) return false;

	let distance = 0;
	for (const color of colors) {
		const ch = color.h * 360;
		const cs = color.s;
		const cl = color.l;

		// Handle hue wraparound (0 and 360 are the same point on the color wheel)
		const hDiff = Math.min(Math.abs(ch - targetH), 360 - Math.abs(ch - targetH));
		const sDiff = Math.abs(cs - targetS);
		const lDiff = Math.abs(cl - targetL);

		distance += (hDiff / 180 + sDiff + lDiff) * color.area;

		// Early exit if already over threshold
		if (distance > threshold) return false;
	}

	return true;
}
