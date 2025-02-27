import { ItemView, WorkspaceLeaf } from "obsidian";
import Gallery from "./../components/Gallery.svelte";
import type MediaCompanion from "main";

export const VIEW_TYPE_GALLERY = "gallery-view";

export class GalleryView extends ItemView {
	component!: Gallery;
	plugin: MediaCompanion;

	public constructor(leaf: WorkspaceLeaf, plugin: MediaCompanion) {
		super(leaf);
		this.plugin = plugin;
	}

	public getViewType() {
		return VIEW_TYPE_GALLERY;
	}

	public getDisplayText() {
		return "Gallery view";
	}

	public getIcon() {
		return "image";
	}

	public async onOpen() {
		this.contentEl.addClass("MC-gallery-page-container");
		this.component = new Gallery({
			target: this.contentEl,
			props: { }
		});
	}

	public async onClose() {
		this.component.$destroy();
	}
}
