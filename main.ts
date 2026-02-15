import { App, debounce, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from 'src/settings'
import type { MediaCompanionSettings } from 'src/settings';
import Cache from 'src/cache';
import MutationHandler from 'src/mutationHandler';
import MediaFile from 'src/model/mediaFile';
import { SidecarView, VIEW_TYPE_SIDECAR } from 'src/views/sidecar-view';
import { WaterfallBasesView, BASES_VIEW_TYPE_WATERFALL, getWaterfallViewOptions } from 'src/views/waterfall-bases-view';

export default class MediaCompanion extends Plugin {
	settings!: MediaCompanionSettings;
	cache!: Cache;
	mutationHandler!: MutationHandler;

	async onload() {
		await this.loadSettings();
		
		this.cache = new Cache(this.app, this);
		this.mutationHandler = new MutationHandler(this.app, this, this.cache);

		// Views should be registered AFTER the cache object and mutationHandler
		// are initialized
		this.registerViews();
		this.registerBasesViews();

		this.app.workspace.onLayoutReady(async () => {
			await this.cache.initialize();

			// Register events only after the cache is initialized and the
			// layout is ready to avoid many events being sent off
			this.registerEvents();

			// @ts-ignore - Need to set this manually, unsure if there's a better way
			this.app.metadataTypeManager.properties[MediaFile.last_updated_tag.toLowerCase()].type = "datetime";
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

		// When a media file is opened in a non-sidecar view (e.g. from
		// the file explorer), redirect it to our SidecarView.
		let redirecting = false;
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
			if (redirecting || !leaf) return;
			if (leaf.view?.getViewType() === VIEW_TYPE_SIDECAR) return;
			if (leaf.getRoot() !== this.app.workspace.rootSplit) return;

			const filePath = leaf.getViewState()?.state?.file as string | undefined;
			if (!filePath) return;

			const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
			if (!this.settings.extensions.includes(ext)) return;

			redirecting = true;
			leaf.setViewState({
				type: VIEW_TYPE_SIDECAR,
				state: { file: filePath },
			}).finally(() => { redirecting = false; });
		}));
	}

	registerViews() {
		this.registerView(VIEW_TYPE_SIDECAR, (leaf) => new SidecarView(leaf));

		// Register only extensions that Obsidian doesn't already handle.
		// Built-in extensions (png, jpg, mp4, ...) are already registered and
		// calling registerExtensions with them would throw.
		const alreadyRegistered = new Set(Object.keys(this.app.viewRegistry.typeByExtension));
		const newExts = this.settings.extensions.filter(ext => !alreadyRegistered.has(ext));
		
		if (newExts.length > 0) {
			this.registerExtensions(newExts, VIEW_TYPE_SIDECAR);
		}
	}

	registerBasesViews() {
		this.registerBasesView(BASES_VIEW_TYPE_WATERFALL, {
			name: 'Media Waterfall',
			icon: 'layout-grid',
			factory: (controller, containerEl) => {
				return new WaterfallBasesView(controller, containerEl);
			},
			options: () => getWaterfallViewOptions(),
		});
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
