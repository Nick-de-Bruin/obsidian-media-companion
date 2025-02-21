import type { App, TFile } from "obsidian";
import MediaFile from "./model/mediaFile";
import type MediaCompanion from "main";
import { getMediaType, MediaTypes } from "./model/types/mediaTypes";
import MCImage from "./model/types/image/image";
import type { FileExplorerLeaf } from "obsidian-typings";
import Sidecar from "./model/sidecar";

/**
 * Represents a cache for media files
 */
export default class Cache {
	// The cached files
	public files: MediaFile[];

	private app: App;
	private plugin: MediaCompanion;

	// Whether there is files currently being added or removed from the cache
	private building = false;
	private initialized = false;

	public constructor(app: App, plugin: MediaCompanion) {
		this.files = [];
        
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Will wait in steps of 100ms until the cache is initialized
	 */
	public async awaitReady(): Promise<void> {
		await this.initialize();
		if (this.building || !this.initialized) {
			while (this.building || !this.initialized) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}
	}

	/**
     * Initialize the cache with all the (supported) files in the vault
     */
	public async initialize(): Promise<void> {
		if (this.initialized) return;
        
		// Prevent multiple initializations
		if (this.building) {
			while (this.building) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			return;
		}

		this.building = true;

		while (this.app.metadataCache.inProgressTaskCount > 0) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
        
		let files = this.app.vault.getFiles();

		const timer = Date.now();

		const total_files = files.length;

		files = files.filter(f => this.plugin.settings.extensions.contains(f.extension.toLowerCase()));

		console.debug(
			`%c[Media Companion]: %cBuilding cache with ${files.length} media files found of ${total_files} files total \n                   If this is the first time, this may take a while`, 
			"color: #00b7eb", "color: inherit"
		);

		const notice = new Notice(`Building cache with ${files.length} media files found of ${total_files} files total\nProcessing may take a while if many new files have been added`, 0);	

		let total_done = 0;

		for (const file of files) {
			let mediaFile;

			switch (getMediaType(file.extension)) {
				case MediaTypes.Image:
					mediaFile = await MCImage.create(file, this.app);
					break;
				case MediaTypes.Unknown:
				default:
					mediaFile = await MediaFile.create(file, this.app);
					break;
			}
                
			this.addFile(mediaFile);

			total_done++;
			notice.setMessage(`Media Companion: ${total_done}/${files.length} files processed\nProcessing may take a while if many new files have been added`);
		}

		notice.hide();

		console.debug(
			`%c[Media Companion]: %cFinished building cache in ${(Date.now() - timer) / 1000}s, ${this.files.length} files in cache`, 
			"color: #00b7eb", "color: inherit"
		);

		this.initialized = true;
		this.building = false;
	}

	/**
	 * Will add new files to the cache or remove unneeded ones.
	 * Should be called whenever plugin.settings.extensions is changed.
	 */
	public async updateExtensions(): Promise<void> {
		if (this.building) {
			while (this.building) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}

		this.building = true;

		this.files = this.files.filter(f => this.plugin.settings.extensions.contains(f.file.extension.toLowerCase()));

		let files = this.app.vault.getFiles();

		files = files.filter(f => this.plugin.settings.extensions.contains(f.extension.toLowerCase()));
		// This is an awful way to do this; It's O(N^2) - Should improve at some point
		files = files.filter(f => !this.files.filter(mf => mf.file.path == f.path));

		const notice = new Notice(`Adding ${files.length} new files`, 0);	

		let total_done = 0;

		for (const file of files) {
			let mediaFile;

			switch (getMediaType(file.extension)) {
				case MediaTypes.Image:
					mediaFile = await MCImage.create(file, this.app);
					break;
				case MediaTypes.Unknown:
				default:
					mediaFile = await MediaFile.create(file, this.app);
					break;
			}
                
			this.addFile(mediaFile);

			total_done++;
			notice.setMessage(`Media Companion: ${total_done}/${files.length} new files added\nProcessing may take a while if many new files have been added`);
		}

		notice.hide();
		this.building = false;
	}

	/**
     * Add a file to the cache
     * @param file The file to add to the cache
     */
	public addFile(file: MediaFile): void {
		this.files.push(file);
	}

	/**
     * Remove a file from the cache
     * @param file The file to remove
     * @returns Whether the operation removed a file or not
     */
	public removeFile(file: TFile): boolean {
		const length = this.files.length;
        
		this.files = this.files.filter(f => f.file !== file);

		return this.files.length < length;
	}

	/**
     * Get a file from the cache
     * @param path The path of the file to get from the cache
     * @returns The file if it exists in the cache, otherwise undefined
     */
	public getFile(path: string): MediaFile | undefined {
		return this.files.find(f => f.file.path === path);
	}

	/**
     * Checks whether a file is a sidecar file managed by the plugin
     * @param file The file to validate
     * @returns Whether or not it is a sidecar file managed by the plugin
     */
	public isSidecar(file: TFile): boolean {
		if (file.extension !== "md") return false;

		// Check if the path ends with the sidecar extension
		if (!file.path.endsWith(Sidecar.EXTENSION)) return false;

		// Else, get the media file and check if it exists
		const mediaPath = file.path.substring(0, file.path.length - 11);        
		const mediaFile = this.getFile(mediaPath);

		return mediaFile !== undefined;
	}

	/**
	 * Takes every file in the cache and calls the function to hide itself from the
	 * given file explorer leaf.
	 * @param leaf The file manager leaf to hide things from
	 */
	public async hideAll(leaf: FileExplorerLeaf): Promise<void> {
		for (const file of this.files) {
			file.sidecar.hide(leaf);
		}
	}
}
