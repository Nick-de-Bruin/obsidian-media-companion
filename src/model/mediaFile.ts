import { TFile, type App } from "obsidian";
import Sidecar from "./sidecar";
import { getMediaType, type MediaTypes } from "./types/mediaTypes";
import type MediaCompanion from "main";

export default class MediaFile {
	public sidecar!: Sidecar;
	public file!: TFile;
	protected app!: App;
	protected plugin!: MediaCompanion;

	public static last_updated_tag = "MC-last-updated";
    
	protected constructor() { }

	/**
     * Create a new MediaFile from a binary file
     * @param file The file to create a MediaFile from
     * @param app The app instance
	 * @param sidecar The sidecar for the file, in case it already exists
     * @returns The created MediaFile
     */
	public static async create(file: TFile, app: App, plugin: MediaCompanion, sidecar: TFile | null = null): Promise<MediaFile> {
		const f = new MediaFile();

		await MediaFile.fill(f, file, app, plugin, sidecar);

		return f;
	}

	/**
     * Fill the variables of the MediaFile
     * @param f The MediaFile to fill
     * @param file The related binary file
     * @param app The app instance
	 * @param sidecar The sidecar for the file, in case it already exists
     */
	protected static async fill(f: MediaFile, file: TFile, app: App, plugin: MediaCompanion, sidecar: TFile | null = null): Promise<void> {
		f.file = file;
		f.app = app;
		f.plugin = plugin;

		f.sidecar = await Sidecar.create(file, app, plugin, sidecar);

		await f.update();
	}

	/**
	 * Finds the mediaType of the file based on the extension of the file
	 * @returns The MediaType of the file
	 */
	public getType(): MediaTypes {
		return getMediaType(this.file.extension);
	}

	/**
     * To be called when a file has been updated
     */
	public async update(): Promise<void> {
		const last_updated = this.sidecar.getFrontmatterTag(MediaFile.last_updated_tag) as number;

		if (!last_updated ||
            last_updated < this.file.stat.mtime) {
			await this.sidecar.setFrontmatterTag(MediaFile.last_updated_tag, new Date(), "datetime");
		}
	}
}
