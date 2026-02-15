import MediaFile from "src/model/mediaFile";
import type { App, TFile } from "obsidian";
import { extractColors } from "extract-colors";
import type MediaCompanion from "main";

export default class MCImage extends MediaFile {
	// The reserved tags for this type
	// when editing these, they should also be renamed in
	// frontmatter.ts
	public static size_tag = "MC-size";
	public static colors_tag = "MC-colors";

	protected constructor() { super(); }

	/**
     * Create a new MCImage from a file: Use as constructor
     * @param file The file to create the image from
     * @param app The app instance
	 * @param sidecar The sidecar file, if it already exists
     * @returns The created MCImage
     */
	public static async create(file: TFile, app: App, plugin: MediaCompanion, sidecar: TFile | null = null): Promise<MCImage> {
		const f = new MCImage();

		await MCImage.fill(f, file, app, plugin, sidecar)

		return f;
	}

	/**
     * Fill the properties of a file
     * @param f The file to fill
     * @param file The related binary file
     * @param app The app instance
	 * @param sidecar The sidecar file, if it already exists
     */
	protected static async fill(f: MCImage, file: TFile, app: App, plugin: MediaCompanion, sidecar: TFile | null = null) {
		await super.fill(f, file, app, plugin, sidecar);
	}

	/**
     * Extracts the colors from the image file
     * @returns The colors, in the format dictated by the extract-colors package
     */
	private async readColors(): Promise<{h: number, s: number, l: number, area: number}[]> {
		const extracted = await extractColors(
			this.app.vault.getResourcePath(this.file),
			// 1/4th of default pixels to speed up the process
			{pixels: 16000});
		const colors = [];

		for (const e of extracted) {
			colors.push({
				h: e.hue,
				s: e.saturation,
				l: e.lightness,
				area: e.area,
			});
		}

		return colors;
	}

	/**
	 * Finds the cached colors of the image. If they aren't already registered,
	 * they will be extracted and saved when this is called.
	 * @returns The cached colors of the image
	 */
	public async getCachedColors(): Promise<unknown> {
		if (!this.sidecar.getFrontmatterTag(MCImage.colors_tag)) {
			await this.setColors();
		}

		return this.sidecar.getFrontmatterTag(MCImage.colors_tag);
	}

	/**
	 * Extracts and sets the colors for the image
	 */
	private async setColors() {
		const colors = await this.readColors();
		await this.sidecar.setFrontmatterTag(MCImage.colors_tag, colors);
	}

	/**
     * Attempts to parse the given object as an array wit [width, height]. 
     * Returns undefined if failed
     * @param size An object potentially holding the width and height of an image
     * @returns The width and height object, undefined if not present
     */
	private static parseSize(size: unknown): { width: number, height: number } | undefined {
		if (!(size instanceof Array)) return undefined;
        
		if (size.length !== 2) return undefined;

		return { width: size[0], height: size[1] };
	}

	/**
     * Read the width and height from a binary image
     * @returns The size of the image
     */
	private async readSize(): Promise<{ width: number, height: number }> {
		const image = new Image();
        
		image.src = this.app.vault.getResourcePath(this.file);
        
		await image.decode();

		return { width: image.naturalWidth, height: image.naturalHeight };
	}

	/**
	 * Finds and returns the size of the image in pixels.
	 * If there is no size in the cache yet, this will be computed when this is called.
	 * @returns The cached size
	 */
	public async getCachedSize(): Promise<{ width: number, height: number } | undefined> {
		const value = this.sidecar.getFrontmatterTag(MCImage.size_tag);
        
		if (!value || !MCImage.parseSize(value)) {
			await this.setSize();
		}

		return MCImage.parseSize(this.sidecar.getFrontmatterTag(MCImage.size_tag));
	}

	/**
	 * Finds and sets the size of the image to the cache
	 */
	private async setSize() {
		const size = await this.readSize();
		await this.sidecar.setFrontmatterTag(MCImage.size_tag, [size.width, size.height]);
	}

	/**
     * To be called when the file is updated
     */
	public async update() { 
		// If last_updated is older than when the files last updated, update regardless
		// or last_updated is not present

		// Or, if one of our things is not cached / can't be parsed
		const last_updated = this.sidecar.getFrontmatterTag(MediaFile.last_updated_tag) as number;

		// These methods will set as well when the tag cannot be found
		await this.getCachedColors(); 
		await this.getCachedSize();

		if (!last_updated ||
            last_updated < this.file.stat.mtime) {
			await this.setColors();
			await this.setSize();
		}

		// Finally, update the last_updated tag
		await super.update();
	}
}
