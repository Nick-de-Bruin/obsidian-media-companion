import { App, debounce, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { GalleryView, VIEW_TYPE_GALLERY } from 'src/views/gallery-view';
import { DEFAULT_SETTINGS } from 'src/settings'
import type { MediaCompanionSettings } from 'src/settings';
import Cache from 'src/cache';
import MutationHandler from 'src/mutationHandler';
import pluginStore from 'src/stores/pluginStore';
import appStore from 'src/stores/appStore';
import MediaFile from 'src/model/mediaFile';
import { SidecarView, VIEW_TYPE_SIDECAR } from 'src/views/sidecar-view';
import activeStore from 'src/stores/activeStore';

export default class MediaCompanion extends Plugin {
	settings!: MediaCompanionSettings;
	cache!: Cache;
	mutationHandler!: MutationHandler;

	async onload() {
		pluginStore.plugin.set(this);
		appStore.app.set(this.app);

		await this.loadSettings();
		
		this.cache = new Cache(this.app, this);
		this.mutationHandler = new MutationHandler(this.app, this, this.cache);

		// Views should be registered AFTER the cache object and mutationHandler
		// are initialized
		this.registerViews();

		this.app.workspace.onLayoutReady(async () => {
			await this.cache.initialize();

			// Register events only after the cache is initialized and the
			// layout is ready to avoid many events being sent off
			this.registerEvents();

			// @ts-ignore - Need to set this manually, unsure if there's a better way
			this.app.metadataTypeManager.properties[MediaFile.last_updated_tag.toLowerCase()].type = "datetime";
		});

		this.addRibbonIcon('image', 'Open gallery', (_: MouseEvent) => {
			this.createGallery();
		});

		this.addSettingTab(new MediaCompanionSettingTab(this.app, this));
	}

	registerEvents() {
		this.mutationHandler.initializeEvents();

		this.registerEvent(this.app.workspace.on("layout-change", async () => {
			const explorers = this.app.workspace.getLeavesOfType("file-explorer");
			for (const explorer of explorers) {
				await this.cache.hideAll(explorer);
			}
		}));

		this.registerEvent(this.app.workspace.on("file-open", async (file) => {
			if (file) {
				if (this.settings.extensions.contains(file.extension.toLowerCase())) {
					const mediaFile = this.cache.getFile(file.path);
					if (mediaFile) {
						activeStore.file.set(mediaFile);
					}
				}
			}
		}));

		activeStore.file.subscribe(async (file) => {
			if (file) {
				await this.createSidecar();				
			}
		});
	}

	registerViews() {
		this.registerView(VIEW_TYPE_GALLERY, (leaf) => new GalleryView(leaf, this));
		this.registerView(VIEW_TYPE_SIDECAR, (leaf) => new SidecarView(leaf));
	}

	async createSidecar(focus = true) {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDECAR);
		let leaf: WorkspaceLeaf | null = null;

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = this.app.workspace.getRightLeaf(false);
			await leaf?.setViewState({type: VIEW_TYPE_SIDECAR, active: true });
		}

		if (leaf && focus) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async createGallery() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		let leaf: WorkspaceLeaf | null = null;

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = this.app.workspace.getLeaf(true);
			await leaf?.setViewState({type: VIEW_TYPE_GALLERY, active: true });
		}
		
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MediaCompanionSettingTab extends PluginSettingTab {
	plugin: MediaCompanion;

	constructor(app: App, plugin: MediaCompanion) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		const extensionDebounce = debounce(async (value: string) => {
			this.plugin.settings.extensions = value.split(',')
				.map((ext) => ext.trim())
				.map((ext) => ext.replace('.', ''))
				.filter((ext) => ext.length > 0)
				.map((ext) => ext.toLowerCase())
				.filter((ext) => ext !== 'md');
			await this.plugin.saveSettings();
			await this.plugin.cache.updateExtensions();
		}, 500, true);

		containerEl.empty();

		new Setting(containerEl)
			.setName('Hide sidecar files')
			.setDesc('(Recommended) Hide sidecar files in the file explorer.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideSidecar)
				.onChange(async (value) => {
					this.plugin.settings.hideSidecar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Extensions')
			.setDesc('Extensions to be considered as media files, separated by commas.')
			.addTextArea(text => text
				.setPlaceholder('jpg, png, gif')
				.setValue(this.plugin.settings.extensions.join(', '))
				.onChange(async (value) => {
					extensionDebounce(value);
				}));

		new Setting(containerEl)
			.setName('Sidecar template')
			.setDesc('The template to be used for new sidecar files.')
			.addTextArea(text => text
				.setPlaceholder('Sidecar template')
				.setValue(this.plugin.settings.sidecarTemplate)
				.onChange(async (value) => {
					this.plugin.settings.sidecarTemplate = value;
					await this.plugin.saveSettings();
				}));
	}
}
