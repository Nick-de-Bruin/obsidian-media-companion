import type MediaCompanion from "main";
import { TFile, type App, type TAbstractFile } from "obsidian";
import MediaFile from "./model/mediaFile";
import type Cache from "./cache";
import { getMediaType, MediaTypes } from "./model/types/mediaTypes";
import MCImage from "./model/types/image/image";
import Sidecar from "./model/sidecar";

/**
 * Handles mutations in the vault
 */
export default class MutationHandler extends EventTarget {
	public app: App;
	public plugin: MediaCompanion;
	public cache: Cache;

	public constructor(app: App, plugin: MediaCompanion, cache: Cache) {
		super();
        
		this.app = app;
		this.plugin = plugin;
		this.cache = cache;
	}

	public initializeEvents(): void {
		this.plugin.registerEvent(this.app.vault.on("create", this.onFileCreated.bind(this)));
		this.plugin.registerEvent(this.app.vault.on("delete", this.onDeleted.bind(this)));
		this.plugin.registerEvent(this.app.vault.on("rename", this.onMoved.bind(this)));
		this.plugin.registerEvent(this.app.vault.on("modify", this.onFileEdited.bind(this)));
	}

	/**
     * Callback for file editing
     * @param file The edited file
     */
	public onFileEdited(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;

		// In case of a markdown file, look for the extension:
		const isMarkdown = file.extension === "md";

		let mediaPath = file.path;

		if (isMarkdown && !file.path.endsWith(Sidecar.EXTENSION)) return;
		if (isMarkdown) {
			mediaPath = file.path.substring(0, file.path.length - Sidecar.EXTENSION.length);
		}

		const f = this.cache.getFile(mediaPath);
        
		if (f) {
			void f.update();
			if (isMarkdown) {
				this.cache.sidecarUpdated(f);
				this.dispatchEvent(new CustomEvent("sidecar-edited", { detail: f }));
			} else {
				this.dispatchEvent(new CustomEvent("file-edited", { detail: f }));
			}
		}
	}

	/**
     * Callback for file deletion
     * @param file The deleted file
     */
	public onDeleted(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;

		// If someone (accidentally) deletes a sidecar file,
		// make a new one
		const isSidecar = this.cache.isSidecar(file);
		if (isSidecar) {
			const mediaPath = file.path.substring(0, file.path.length - 11);
			const mediaFile = this.app.vault.getFileByPath(mediaPath);
            
			if (mediaFile) this.onFileCreated(mediaFile);
		}


		if (!this.plugin.settings.extensions.contains(file.extension.toLowerCase())) return;

		// get the file
		const f = this.cache.getFile(file.path);
		this.cache.removeFile(file);
        
		if (f) {
			this.dispatchEvent(new CustomEvent("file-deleted", { detail: f }));
		}
        
		// Get sidecar file and remove it
		const sidecar = this.app.vault.getFileByPath(`${file.path}${Sidecar.EXTENSION}`);
		if (sidecar) {
			void this.app.fileManager.trashFile(sidecar);
		}
	}

	/**
     * Callback for file moving or renaming
     * @param file The new file
     * @param oldpath The old path of the file
     */
	public onMoved(file: TAbstractFile, oldpath: string): void {
		if (!(file instanceof TFile)) return;

		// If someone moved a sidecar file
		// Make a new one :(
		const isSidecar = this.cache.isSidecarFromPath(oldpath);
        
		if (isSidecar) {
			const mediaPath = oldpath.substring(0, oldpath.length - Sidecar.EXTENSION.length);
			const mediaFile = this.app.vault.getFileByPath(mediaPath);
            
			if (mediaFile) {
				this.onFileCreated(mediaFile);
			}
		}

		if (!this.plugin.settings.extensions.contains(file.extension.toLowerCase())) return;

		const cacheFile = this.cache.getFile(file.path);
		const sidecar = this.app.vault.getFileByPath(`${oldpath}${Sidecar.EXTENSION}`);

		if (sidecar) {
			void this.app.fileManager.renameFile(sidecar, `${file.path}${Sidecar.EXTENSION}`);
		}

		if (!cacheFile) {
			this.createMediaFile(file, sidecar).then((mediaFile) => {
				if (mediaFile) {
					this.cache.fileMoved(mediaFile, oldpath);
					this.dispatchEvent(new CustomEvent("file-moved", { detail: {file: mediaFile, oldPath: oldpath} }));
				}
			});
		}
	}

	/**
     * Callback for file creation
     * @param file The created file
     */
	public onFileCreated(file: TAbstractFile): void {
		this.createMediaFile(file).then((mediaFile) => {
			if (mediaFile) {
				this.dispatchEvent(new CustomEvent("file-created", { detail: mediaFile }));
			}
		});
	}

	/**
	 * Created a MediaFile of the correct type. E.g.; For an image, an MCImage will be made.
	 * @param file The file to be made a mediaFile for. Will be checked to be of type TFile and whether its
	 * extension is in the current plugin settings
	 * @param sidecar The sidecar file, if there is already one. For example, if the file has been moved.
	 * @returns The created media file, of the correct type, or null if none was created
	 */
	private async createMediaFile(file: TAbstractFile, sidecar: TFile | null = null): Promise<MediaFile | null> {
		if (!(file instanceof TFile) || !this.plugin.settings.extensions.contains(file.extension.toLowerCase())) return null;

		// Make sure it is not already in the cache
		if (this.cache.getFile(file.path)) return null;

		let mediaFile = null;

		switch (getMediaType(file.extension)) {
			case MediaTypes.Image:
				mediaFile = await MCImage.create(file, this.app, this.plugin, sidecar);
				break;
			case MediaTypes.Video:
			case MediaTypes.Unknown:
				mediaFile = await MediaFile.create(file, this.app, this.plugin, sidecar);
				break;
		}

		if (mediaFile) {
			this.cache.addFile(mediaFile);
		}

		return mediaFile;
	}
}
