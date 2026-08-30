import { App, debounce, Platform, Plugin, PluginSettingTab, Setting, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from 'src/settings'
import type { MediaCompanionSettings } from 'src/settings';
import Cache from 'src/cache';
import MutationHandler from 'src/mutationHandler';
import MediaFile from 'src/model/mediaFile';
import { SidecarView, VIEW_TYPE_SIDECAR } from 'src/views/sidecar-view';
import { WaterfallBasesView, BASES_VIEW_TYPE_WATERFALL, getWaterfallViewOptions } from 'src/views/waterfall-bases-view';
import ApiServer from 'src/api/server';

export default class MediaCompanion extends Plugin {
	settings!: MediaCompanionSettings;
	cache!: Cache;
	mutationHandler!: MutationHandler;
	apiServer!: ApiServer;

	async onload() {
		await this.loadSettings();
		
		this.cache = new Cache(this.app, this);
		this.mutationHandler = new MutationHandler(this.app, this, this.cache);
		this.apiServer = new ApiServer(this.app, this, this.cache);

		// Views should be registered AFTER the cache object and mutationHandler
		// are initialized
		this.registerViews();
		this.registerBasesViews();
		this.registerNoteImageOverlay();

		this.app.workspace.onLayoutReady(async () => {
			await this.cache.initialize();

			// Register events only after the cache is initialized and the
			// layout is ready to avoid many events being sent off
			this.registerEvents();

			// Start the local API server (desktop only, opt-in)
			this.apiServer.start();

			// @ts-ignore - Need to set this manually, unsure if there's a better way
			this.app.metadataTypeManager.properties[MediaFile.last_updated_tag.toLowerCase()].type = "datetime";
		});

		this.addSettingTab(new MediaCompanionSettingTab(this.app, this));
	}

	onunload() {
		this.apiServer.stop();
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
		// the file explorer), open it in the right sidebar instead of
		// hijacking the current leaf. Mirrors WaterfallBasesView.openInSidebar.
		let redirecting = false;
		this.registerEvent(this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (redirecting || !leaf) return;
			if (leaf.view?.getViewType() === VIEW_TYPE_SIDECAR) return;
			if (leaf.getRoot() !== this.app.workspace.rootSplit) return;

			const file = leaf.workspace.getActiveFile()
			if (!file) return;

			if (!this.settings.extensions.includes(file.extension)) return;

			redirecting = true;
			try {
				await this.openInSidebar(file);
			} finally {
				redirecting = false;
			}
		}));
	}

	private async openInSidebar(file: TFile): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;

		for (const l of workspace.getLeavesOfType(VIEW_TYPE_SIDECAR)) {
			if (l.getRoot() === workspace.rightSplit) {
				leaf = l;
				break;
			}
		}

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
		}

		await leaf.setViewState({
			type: VIEW_TYPE_SIDECAR,
			state: { file: file.path },
		});

		workspace.revealLeaf(leaf);
	}

	private registerNoteImageOverlay(): void {
		const injectForImg = (img: HTMLImageElement, sourcePath: string) => {
			if ((img as any).dataset.mcOverlay === '1') return;
			if (img.classList.contains('cm-widgetBuffer') || img.getAttribute('aria-hidden') === 'true') return;
			// Resolve the media file path: prefer the wrapper's src (wiki link), fall back to alt/src
			let rawPath: string | null = null;
			const wrapper = img.closest('.internal-embed') as HTMLElement | null;
			if (wrapper?.getAttribute('src')) rawPath = wrapper.getAttribute('src');
			if (!rawPath) rawPath = img.getAttribute('alt') || img.getAttribute('src') || '';
			// Also check data-src (obsidian sometimes uses it)
			if (!rawPath) rawPath = img.getAttribute('data-src') || '';
			if (!rawPath) return;
			if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return;
			if (rawPath.startsWith('app://')) {
				try {
					const url = new URL(rawPath);
					const name = decodeURIComponent(url.pathname.split('/').pop() || '');
					if (name) rawPath = name;
					else return;
				} catch { return; }
			}
			const clean = rawPath.split('?')[0].split('#')[0].split('|')[0].trim();
			if (!clean) return;
			const decoded = decodeURIComponent(clean);
			let file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(decoded, sourcePath) as TFile | null;
			if (!file) {
				const byPath = this.app.vault.getAbstractFileByPath(decoded);
				if (byPath instanceof TFile) file = byPath;
			}
			if (!file) {
				const base = decoded.split('/').pop() || decoded;
				file = this.app.vault.getFiles().find((f) => f.name === base || f.path.endsWith('/' + base)) as TFile || null;
			}
			if (!file || !this.settings.extensions.includes(file.extension)) return;

			const container = (wrapper ?? img.parentElement) as HTMLElement | null;
			if (!container) return;
			// Prefer native toolbar (.embed-actions) so our button sits alongside zoom/edit
			const nativeToolbar = container.querySelector('.embed-actions') as HTMLElement | null;
			if (nativeToolbar) {
				if (nativeToolbar.querySelector('[data-mc-btn]')) {
					(img as any).dataset.mcOverlay = '1';
					return;
				}
				const btn = nativeToolbar.createDiv({ cls: 'embed-action', attr: { 'data-mc-btn': '1', 'aria-label': 'Open sidecar in sidebar' } });
				setIcon(btn, 'panel-right-open');
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					void this.openInSidebar(file!);
				});
				(img as any).dataset.mcOverlay = '1';
				return;
			}
			// Fallback: no native toolbar (e.g. some preview contexts) → own hover toolbar
			container.addClass('mc-note-image-container');
			if (container.querySelector(':scope > .mc-note-image-toolbar [data-mc-btn]')) return;
			let toolbar = container.querySelector(':scope > .mc-note-image-toolbar') as HTMLElement | null;
			if (!toolbar) toolbar = container.createDiv({ cls: 'mc-note-image-toolbar' });
			if (toolbar.querySelector('[data-mc-btn]')) return;
			const btn = toolbar.createDiv({ cls: 'mc-note-image-btn', attr: { 'data-mc-btn': '1', 'aria-label': 'Open sidecar in sidebar' } });
			setIcon(btn, 'panel-right-open');
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				void this.openInSidebar(file!);
			});
			(img as any).dataset.mcOverlay = '1';
		};

		this.registerMarkdownPostProcessor((el, ctx) => {
			el.querySelectorAll<HTMLImageElement>('img:not(.cm-widgetBuffer)').forEach((img) => injectForImg(img, ctx.sourcePath));
		});

		// Live Preview / editor: markdown post-processor doesn't run there, observe DOM
		const observer = new MutationObserver(() => {
			document.querySelectorAll<HTMLImageElement>('.markdown-source-view img:not(.cm-widgetBuffer), .markdown-preview-view img:not(.cm-widgetBuffer)').forEach((img) => {
				if ((img as any).dataset.mcOverlay === '1' || img.getAttribute('aria-hidden') === 'true') return;
				const active = this.app.workspace.getActiveFile()?.path || '';
				injectForImg(img, active);
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
		this.register(() => observer.disconnect());
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
				return new WaterfallBasesView(controller, containerEl, () => this.settings);
			},
			options: () => getWaterfallViewOptions(),
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.app.workspace.trigger("mc:settings-changed");
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

		containerEl.createEl('h3', { text: 'Browser Extension API' });

		if (!Platform.isDesktopApp) {
			containerEl.createEl('p', {
				text: 'The API server is only available on desktop.',
				cls: 'setting-item-description',
			});
		}

		new Setting(containerEl)
			.setName('Enable API server')
			.setDesc('Start a local HTTP server so the browser extension can communicate with this plugin. Desktop only.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.apiEnabled)
				.setDisabled(!Platform.isDesktopApp)
				.onChange(async (value) => {
					this.plugin.settings.apiEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.apiServer.restart();
				}));

		new Setting(containerEl)
			.setName('API port')
			.setDesc('The port the API server listens on (default 27124). Requires restart.')
			.addText(text => text
				.setPlaceholder('27124')
				.setValue(String(this.plugin.settings.apiPort))
				.onChange(async (value) => {
					const port = parseInt(value, 10);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.apiPort = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Optional Bearer token for authentication. Leave empty to allow unauthenticated local access.')
			.addText(text => text
				.setPlaceholder('(no key)')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value.trim();
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Waterfall View' });

		new Setting(containerEl)
			.setName('Fullscreen preview')
			.setDesc('How the fullscreen preview is triggered from the waterfall view.')
			.addDropdown(dropdown => dropdown
				.addOption('off', 'Off')
				.addOption('hover', 'Hover')
				.addOption('click', 'Click')
				.setValue(this.plugin.settings.fullscreenMode)
				.onChange(async (value) => {
					this.plugin.settings.fullscreenMode = value as "off" | "hover" | "click";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fullscreen hover delay')
			.setDesc('How long (in ms) to hover over the preview icon before the fullscreen opens. Only applies in hover mode.')
			.addSlider(slider => slider
				.setLimits(200, 3000, 100)
				.setValue(this.plugin.settings.fullscreenHoverDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fullscreenHoverDelay = value;
					await this.plugin.saveSettings();
				}));
	}
}
