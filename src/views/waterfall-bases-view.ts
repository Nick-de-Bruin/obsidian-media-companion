import { BasesView, Keymap, Menu, Notice, parsePropertyId, TFolder, type BasesPropertyId, type QueryController, type HoverParent, type HoverPopover, type TFile, type BasesEntry, type WorkspaceLeaf } from "obsidian";
import Sidecar from "../model/sidecar";
import { getMediaType, MediaTypes } from "../model/types/mediaTypes";
import { getShape } from "../model/types/shape";
import { hexToRgb, rgbToHsl, isColorWithinThreshold } from "../util/color";
import { VIEW_TYPE_SIDECAR } from "./sidecar-view";

export const BASES_VIEW_TYPE_WATERFALL = "mc-waterfall";

const LABEL_HEIGHT = 24;
const PROP_LINE_HEIGHT = 20;
const BUFFER_PX = 800;
const PADDING = 8;

interface LayoutItem {
	mediaFile: TFile;
	sidecarFile: TFile | null;
	entry: BasesEntry | null;
	metaWidth: number;
	metaHeight: number;
	colors: { h: number; s: number; l: number; area: number }[] | null;

	col: number;
	x: number;
	y: number;

	itemHeight: number;
	measured: boolean;
	el: HTMLElement | null;
}

/**
 * A Bases view that renders media in a waterfall (masonry) layout using
 * absolute positioning with virtual scrolling.
 */
export class WaterfallBasesView extends BasesView implements HoverParent {
	readonly type = BASES_VIEW_TYPE_WATERFALL;
	hoverPopover: HoverPopover | null = null;

	private scrollEl!: HTMLElement;
	private containerEl!: HTMLElement;
	private resizeObserver!: ResizeObserver;

	private layoutItems: LayoutItem[] = [];
	private columnHeights: number[] = [];
	private numColumns = 1;
	private colWidthSetting = 200;
	private gap = 8;
	private showFilename = true;
	private showProperties = false;

	private actualColWidth = 200;
	private offsetX = 0;
	private rafId: number | null = null;

	private lastDataFingerprint = "";
	private lastShowFilename = true;
	private lastShowProperties = false;
	private visibleProperties: BasesPropertyId[] = [];
	private lastPropsFingerprint = "";

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);

		this.scrollEl = parentEl.createDiv({ cls: "mc-waterfall-scroll" });
		this.containerEl = this.scrollEl.createDiv({ cls: "mc-waterfall-container" });

		this.scrollEl.addEventListener("scroll", () => this.scheduleSync(), { passive: true });

		this.resizeObserver = new ResizeObserver(() => {
			this.relayoutInPlace();
		});
		this.resizeObserver.observe(this.scrollEl);
	}

	private scheduleSync(): void {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.syncDOM();
		});
	}

	public onDataUpdated(): void {
		const newColWidth = Number(this.config.get("columnWidth")) || 200;
		const newGap = Number(this.config.get("gap")) || 8;
		const newShowFilename = this.config.get("showFilename") !== false;
		const newShowProperties = this.config.get("showProperties") === true;

		const newVisibleProperties = this.config.getOrder().filter(pid => {
			const parsed = parsePropertyId(pid);
			
			return !(parsed.type === "file" && parsed.name === "fileName");
		});
		const newPropsFingerprint = newVisibleProperties.join(",");
		this.visibleProperties = newVisibleProperties;

		const filterColor = String(this.config.get("filterColor") || "").trim();
		const colorThreshold = Number(this.config.get("colorThreshold")) || 50;
		const filterShape = String(this.config.get("filterShape") || "").trim().toLowerCase();
		const filterMinWidth = parseInt(String(this.config.get("filterMinWidth") || ""), 10) || 0;
		const filterMaxWidth = parseInt(String(this.config.get("filterMaxWidth") || ""), 10) || 0;
		const filterMinHeight = parseInt(String(this.config.get("filterMinHeight") || ""), 10) || 0;
		const filterMaxHeight = parseInt(String(this.config.get("filterMaxHeight") || ""), 10) || 0;
		const searchQuery = String(this.config.get("searchQuery") || "").trim().toLowerCase();

		const dataIds = this.data.groupedData.flatMap(g => g.entries.map(e => e.file.path)).join("\n");
		const fingerprint = `${dataIds}|${filterColor}|${colorThreshold}|${filterShape}|${filterMinWidth}|${filterMaxWidth}|${filterMinHeight}|${filterMaxHeight}|${searchQuery}`;

		const layoutOnly = fingerprint === this.lastDataFingerprint && this.layoutItems.length > 0;

		this.colWidthSetting = newColWidth;
		this.gap = newGap;
		this.showFilename = newShowFilename;
		this.showProperties = newShowProperties;

		if (layoutOnly) {
			if (newShowFilename !== this.lastShowFilename) {
				const delta = newShowFilename ? LABEL_HEIGHT : -LABEL_HEIGHT;

				for (const item of this.layoutItems) {
					item.itemHeight += delta;
				}
				
				for (const item of this.layoutItems) {
					if (!item.el) continue;
					
					const existing = item.el.querySelector(".mc-waterfall-name");
					
					if (newShowFilename && !existing) {
						const propsEl = item.el.querySelector(".mc-waterfall-props");
						const nameEl = createDiv({ cls: "mc-waterfall-name", text: item.mediaFile.basename });
						
						if (propsEl) {
							item.el.insertBefore(nameEl, propsEl);
						} else {
							item.el.appendChild(nameEl);
						}
					} else if (!newShowFilename && existing) {
						existing.remove();
					}
				}
			}
			this.lastShowFilename = newShowFilename;

			const propsToggled = newShowProperties !== this.lastShowProperties;
			const propsListChanged = newPropsFingerprint !== this.lastPropsFingerprint;

			if (propsToggled || (newShowProperties && propsListChanged)) {
				const oldCount = this.lastShowProperties
					? this.lastPropsFingerprint.split(",").filter(Boolean).length : 0;
				const newCount = newShowProperties ? this.visibleProperties.length : 0;
				const oldPropsH = oldCount > 0 ? oldCount * PROP_LINE_HEIGHT + 6 : 0;
				const newPropsH = newCount > 0 ? newCount * PROP_LINE_HEIGHT + 6 : 0;
				const delta = newPropsH - oldPropsH;

				if (Math.abs(delta) > 0) {
					for (const item of this.layoutItems) {
						item.itemHeight += delta;
					}
				}

				// Re-render props DOM on mounted items
				for (const item of this.layoutItems) {
					if (!item.el) continue;
					
					const existing = item.el.querySelector(".mc-waterfall-props");
					
					if (existing) existing.remove();
				if (newShowProperties && this.visibleProperties.length > 0) {
					if (item.entry) this.renderProperties(item.el, item.entry);
				}
				}
			}
			
			this.lastShowProperties = newShowProperties;
			this.lastPropsFingerprint = newPropsFingerprint;

			this.relayoutInPlace(true);
			return;
		}

		this.lastDataFingerprint = fingerprint;
		this.lastShowFilename = newShowFilename;
		this.lastShowProperties = newShowProperties;
		this.lastPropsFingerprint = newPropsFingerprint;

		let targetHsl: [number, number, number] | null = null;
		
		if (filterColor) {
			const rgb = hexToRgb(filterColor);
			
			if (rgb) targetHsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
		}

		this.clearDOM();
		this.layoutItems = [];

		const seenMediaPaths = new Set<string>();
		const foldersInResult = new Set<string>();
		let deduplicatedCount = 0;

		for (const group of this.data.groupedData) {
			for (const entry of group.entries) {
				const resolved = this.resolveMediaFile(entry.file);
				if (!resolved) continue;

				const { mediaFile, sidecarFile } = resolved;

				if (mediaFile.parent) foldersInResult.add(mediaFile.parent.path);

				if (seenMediaPaths.has(mediaFile.path)) {
					deduplicatedCount++;
					continue;
				}
				seenMediaPaths.add(mediaFile.path);

				const meta = this.readSidecarMeta(sidecarFile);

				if (searchQuery && !mediaFile.path.toLowerCase().includes(searchQuery)) continue;
				if (filterShape && meta.width > 0 && meta.height > 0 && getShape(meta.width, meta.height) !== filterShape) continue;
				if (filterMinWidth > 0 && meta.width > 0 && meta.width < filterMinWidth) continue;
				if (filterMaxWidth > 0 && meta.width > 0 && meta.width > filterMaxWidth) continue;
				if (filterMinHeight > 0 && meta.height > 0 && meta.height < filterMinHeight) continue;
				if (filterMaxHeight > 0 && meta.height > 0 && meta.height > filterMaxHeight) continue;

				if (targetHsl && meta.colors) {
					if (!isColorWithinThreshold(targetHsl[0], targetHsl[1], targetHsl[2], meta.colors, colorThreshold / 100)) continue;
				}

				this.layoutItems.push({
					mediaFile, sidecarFile, entry,
					metaWidth: meta.width, metaHeight: meta.height,
					colors: meta.colors,
					col: 0, x: 0, y: 0, itemHeight: 0,
					measured: false, el: null,
				});
			}
		}

		// When the Bases limit counted both a media file and its sidecar as separate entries, 
		// our dedup reduced the visible count. Fill the remainder by scanning the vault for
		// additional sidecar-backed media files in the same folders.
		if (deduplicatedCount > 0) {
			let remaining = deduplicatedCount;
			
			for (const folderPath of foldersInResult) {
				if (remaining <= 0) break;
				
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				
				if (!(folder instanceof TFolder)) continue;
				
				for (const child of folder.children) {
					if (remaining <= 0) break;
					
					if (!child.path.endsWith(Sidecar.EXTENSION)) continue;
					
					const mediaPath = child.path.slice(0, -Sidecar.EXTENSION.length);
					
					if (seenMediaPaths.has(mediaPath)) continue;
					
					const sidecarFile = this.app.vault.getFileByPath(child.path);
					
					if (!sidecarFile) continue;
					
					const mediaFile = this.app.vault.getFileByPath(mediaPath);
					
					if (!mediaFile) continue;

					seenMediaPaths.add(mediaPath);
					const meta = this.readSidecarMeta(sidecarFile);

					if (searchQuery && !mediaFile.path.toLowerCase().includes(searchQuery)) continue;
					if (filterShape && meta.width > 0 && meta.height > 0 && getShape(meta.width, meta.height) !== filterShape) continue;
					if (filterMinWidth > 0 && meta.width > 0 && meta.width < filterMinWidth) continue;
					if (filterMaxWidth > 0 && meta.width > 0 && meta.width > filterMaxWidth) continue;
					if (filterMinHeight > 0 && meta.height > 0 && meta.height < filterMinHeight) continue;
					if (filterMaxHeight > 0 && meta.height > 0 && meta.height > filterMaxHeight) continue;
					if (targetHsl && meta.colors) {
						if (!isColorWithinThreshold(targetHsl[0], targetHsl[1], targetHsl[2], meta.colors, colorThreshold / 100)) continue;
					}

					this.layoutItems.push({
						mediaFile, sidecarFile, entry: null,
						metaWidth: meta.width, metaHeight: meta.height,
						colors: meta.colors,
						col: 0, x: 0, y: 0, itemHeight: 0,
						measured: false, el: null,
					});
					remaining--;
				}
			}
		}

		if (this.layoutItems.length === 0) {
			this.containerEl.style.height = "";
			
			this.containerEl.createDiv({
				cls: "mc-waterfall-empty",
				text: "No media files found. Make sure your Base queries sidecar (.sidecar.md) files or supported media files.",
			});
			
			return;
		}

		this.computePositions();
		this.syncDOM();
	}

	private get footerHeight(): number {
		let h = 0;
		if (this.showFilename) h += LABEL_HEIGHT;
		if (this.showProperties && this.visibleProperties.length > 0) {
			h += this.visibleProperties.length * PROP_LINE_HEIGHT + 6;
		}
		return h;
	}

	private computePositions(): void {
		const clientW = this.scrollEl.clientWidth || 400;
		const available = clientW - PADDING * 2;
		
		this.numColumns = Math.max(1, Math.floor((available + this.gap) / (this.colWidthSetting + this.gap)));
		this.actualColWidth = (available - (this.numColumns - 1) * this.gap) / this.numColumns;

		const totalUsed = this.numColumns * this.actualColWidth + (this.numColumns - 1) * this.gap;
		
		this.offsetX = (clientW - totalUsed) / 2;
		this.columnHeights = new Array(this.numColumns).fill(PADDING);

		for (const item of this.layoutItems) {
			const col = this.shortestColumn();
			
			item.col = col;
			item.x = this.offsetX + col * (this.actualColWidth + this.gap);
			item.y = this.columnHeights[col];

			if (!item.measured) {
				const mediaH = item.metaWidth > 0 && item.metaHeight > 0
					? (this.actualColWidth / item.metaWidth) * item.metaHeight
					: this.actualColWidth; // square fallback
				item.itemHeight = mediaH + this.footerHeight;
			}
			this.columnHeights[col] += item.itemHeight + this.gap;
		}

		this.containerEl.style.height = `${Math.max(0, ...this.columnHeights)}px`;
	}

	private shortestColumn(): number {
		let min = 0;
		for (let i = 1; i < this.numColumns; i++) {
			if (this.columnHeights[i] < this.columnHeights[min]) min = i;
		}
		return min;
	}

	private relayoutInPlace(force = false): void {
		if (this.layoutItems.length === 0) return;

		const oldColWidth = this.actualColWidth;
		const available = (this.scrollEl.clientWidth || 400) - PADDING * 2;
		const newNumCols = Math.max(1, Math.floor((available + this.gap) / (this.colWidthSetting + this.gap)));
		const newColWidth = (available - (newNumCols - 1) * this.gap) / newNumCols;

		if (!force && newNumCols === this.numColumns && Math.abs(newColWidth - oldColWidth) < 0.5) return;

		const scale = newColWidth / (oldColWidth || 1);

		for (const item of this.layoutItems) {
			if (item.measured) {
				const footer = this.footerHeight;
				
				item.itemHeight = (item.itemHeight - footer) * scale + footer;
			}
		}

		this.computePositions();

		for (const item of this.layoutItems) {
			if (!item.el) continue;
			
			item.el.style.top = `${item.y}px`;
			item.el.style.left = `${item.x}px`;
			item.el.style.width = `${this.actualColWidth}px`;
			item.el.style.height = `${item.itemHeight}px`;
		}

		this.syncDOM();
	}

	private reflowColumn(changed: LayoutItem, newHeight: number): void {
		const delta = newHeight - changed.itemHeight;
		if (Math.abs(delta) < 1) return;

		changed.itemHeight = newHeight;
		if (changed.el) changed.el.style.height = `${newHeight}px`;

		const col = changed.col;
		let past = false;

		for (const item of this.layoutItems) {
			if (item === changed) { past = true; continue; }
			if (!past || item.col !== col) continue;
			
			item.y += delta;
			
			if (item.el) item.el.style.top = `${item.y}px`;
		}

		this.columnHeights[col] += delta;
		this.containerEl.style.height = `${Math.max(0, ...this.columnHeights)}px`;

		this.syncDOM();
	}

	private syncDOM(): void {
		const scrollTop = this.scrollEl.scrollTop;
		const viewHeight = this.scrollEl.clientHeight;
		const top = scrollTop - BUFFER_PX;
		const bottom = scrollTop + viewHeight + BUFFER_PX;

		for (const item of this.layoutItems) {
			const inView = item.y + item.itemHeight > top && item.y < bottom;

			if (inView && !item.el) {
				this.mountItem(item);
			} else if (!inView && item.el) {
				item.el.remove();
				item.el = null;
			}
		}
	}

	private clearDOM(): void {
		for (const item of this.layoutItems) {
			if (item.el) { item.el.remove(); item.el = null; }
		}
		
		this.containerEl.empty();
	}

	private mountItem(item: LayoutItem): void {
		const el = this.containerEl.createDiv({ cls: "mc-waterfall-item" });
		item.el = el;

		el.style.top = `${item.y}px`;
		el.style.left = `${item.x}px`;
		el.style.width = `${this.actualColWidth}px`;
		el.style.height = `${item.itemHeight}px`;

		const mc = el.createDiv({ cls: "mc-waterfall-media" });
		const mediaH = item.itemHeight - this.footerHeight;
		const ph = mc.createDiv({ cls: "mc-waterfall-placeholder" });
		
		ph.style.height = `${Math.max(mediaH, 50)}px`;

		this.loadMediaContent(item, el, mc);

		if (this.showFilename) {
			el.createDiv({ cls: "mc-waterfall-name", text: item.mediaFile.basename });
		}

		if (this.showProperties && this.visibleProperties.length > 0) {
			if (item.entry) this.renderProperties(el, item.entry);
		}

		el.setAttribute("draggable", "true");
		el.addEventListener("dragstart", (evt) => {
			if (!evt.dataTransfer) return;
			
			const resourcePath = this.app.vault.getResourcePath(item.mediaFile);
			evt.dataTransfer.setData("text/uri-list", resourcePath);
			evt.dataTransfer.setData("text/plain", item.mediaFile.path);
			evt.dataTransfer.effectAllowed = "copy";

			const img = el.querySelector("img");
			
			if (img) evt.dataTransfer.setDragImage(img, 0, 0);
		});

		el.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			const menu = new Menu();

			menu.addItem((mi) =>
				mi.setTitle("Copy")
					.setIcon("copy")
					.onClick(() => void this.copyMediaToClipboard(item.mediaFile))
			);

			menu.addItem((mi) =>
				mi.setTitle("Delete")
					.setIcon("trash")
					.onClick(() => void this.deleteMediaFile(item))
			);

			menu.showAtMouseEvent(evt);
		});

		el.addEventListener("click", (evt) => {
			if (evt.button !== 0 && evt.button !== 1) return;
			
			evt.preventDefault();

			if (Keymap.isModEvent(evt)) {
				const newLeaf = this.app.workspace.getLeaf("tab");
				
				void newLeaf.setViewState({
					type: VIEW_TYPE_SIDECAR,
					state: { file: item.mediaFile.path },
				});
				
				this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
			} else {
				void this.openInSidebar(item.mediaFile);
			}
		});

		el.addEventListener("mouseover", (evt) => {
			this.app.workspace.trigger("hover-link", {
				event: evt,
				source: "mc-waterfall",
				hoverParent: this,
				targetEl: el,
				linktext: item.mediaFile.path,
			});
		});
	}

	private loadMediaContent(item: LayoutItem, el: HTMLElement, mc: HTMLElement): void {
		const resourcePath = this.app.vault.getResourcePath(item.mediaFile);
		const mediaType = getMediaType(item.mediaFile.extension);

		const onSized = (naturalW: number, naturalH: number) => {
			const ph = mc.querySelector(".mc-waterfall-placeholder");
			
			if (ph) ph.remove();

			if (item.measured) return; // height already correct
			
			item.measured = true;

			const mediaH = naturalH * (this.actualColWidth / naturalW);
			const newH = mediaH + this.footerHeight;
			this.reflowColumn(item, newH);
		};

		if (mediaType === MediaTypes.Image) {
			const img = mc.createEl("img", {
				attr: { src: resourcePath, alt: item.mediaFile.basename },
			});

			img.addEventListener("load", () => onSized(img.naturalWidth, img.naturalHeight));
		} else if (mediaType === MediaTypes.Video) {
			const video = mc.createEl("video", {
				attr: { src: resourcePath, preload: "metadata", muted: "" },
			});

			video.addEventListener("mouseenter", () => { video.play().catch(() => {}); });
			video.addEventListener("mouseleave", () => { video.pause(); video.currentTime = 0; });
			video.addEventListener("loadedmetadata", () => onSized(video.videoWidth, video.videoHeight));
		} else {
			const embedCreator = this.app.embedRegistry.getEmbedCreator(item.mediaFile);
			
			if (embedCreator) {
				const embedEl = mc.createDiv();
				const embed = embedCreator({ app: this.app, containerEl: embedEl }, item.mediaFile, item.mediaFile.path);
				// @ts-ignore – loadFile exists on embed components
				if (embed.loadFile) embed.loadFile();
			} else {
				mc.createDiv({ text: item.mediaFile.basename, cls: "mc-waterfall-name" });
			}
			
			item.measured = true;
			const ph = mc.querySelector(".mc-waterfall-placeholder");
			
			if (ph) ph.remove();
		}
	}

	private resolveMediaFile(file: TFile): { mediaFile: TFile; sidecarFile: TFile | null } | null {
		if (file.path.endsWith(Sidecar.EXTENSION)) {
			const mediaPath = file.path.slice(0, -Sidecar.EXTENSION.length);
			const mediaFile = this.app.vault.getFileByPath(mediaPath);
			
			return mediaFile ? { mediaFile, sidecarFile: file } : null;
		}

		const mediaType = getMediaType(file.extension);
		
		if (mediaType !== MediaTypes.Unknown) {
			const sidecarFile = this.app.vault.getFileByPath(`${file.path}${Sidecar.EXTENSION}`);
			
			return { mediaFile: file, sidecarFile };
		}

		return null;
	}

	private readSidecarMeta(sidecarFile: TFile | null): {
		width: number;
		height: number;
		colors: { h: number; s: number; l: number; area: number }[] | null;
	} {
		if (!sidecarFile) return { width: 0, height: 0, colors: null };

		const cache = this.app.metadataCache.getFileCache(sidecarFile);
		const fm = cache?.frontmatter;
		
		if (!fm) return { width: 0, height: 0, colors: null };

		let width = 0, height = 0;
		const size = fm["MC-size"];
		
		if (Array.isArray(size) && size.length === 2) {
			width = Number(size[0]) || 0;
			height = Number(size[1]) || 0;
		}

		let colors = null;
		const raw = fm["MC-colors"];
		
		if (Array.isArray(raw)) colors = raw as { h: number; s: number; l: number; area: number }[];

		return { width, height, colors };
	}

	private renderProperties(parentEl: HTMLElement, entry: BasesEntry): void {
		const propsEl = parentEl.createDiv({ cls: "mc-waterfall-props" });
		
		for (const pid of this.visibleProperties) {
			const val = entry.getValue(pid);
			const text = val ? val.toString() : "";
			const name = this.config.getDisplayName(pid);
		
			propsEl.createDiv({ cls: "mc-waterfall-prop", text: `${name}: ${text}` });
		}
	}

	private async copyMediaToClipboard(mediaFile: TFile): Promise<void> {
		try {
			const data = await this.app.vault.readBinary(mediaFile);
			const srcMime = this.getMimeType(mediaFile.extension);

			// The Clipboard API only supports image/png for writing.
			// If the source is already PNG, write directly; otherwise
			// draw onto a canvas and export as PNG.
			let pngBlob: Blob;
			if (srcMime === "image/png") {
				pngBlob = new Blob([data], { type: "image/png" });
			} else if (srcMime.startsWith("image/")) {
				pngBlob = await this.convertToPng(data, srcMime);
			} else {
				// Non-image files fall back to plain text path
				await navigator.clipboard.writeText(mediaFile.path);
				new Notice(`Copied path of ${mediaFile.basename} to clipboard`);
				return;
			}

			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": pngBlob }),
			]);

			new Notice(`Copied ${mediaFile.basename} to clipboard`);

		} catch (e) {
			console.error("Failed to copy media to clipboard", e);

			new Notice("Failed to copy media to clipboard");
		}
	}

	private convertToPng(data: ArrayBuffer, mimeType: string): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const blob = new Blob([data], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const img = new Image();
			
			img.onload = () => {
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d");
				if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas 2D context unavailable")); return; }
				ctx.drawImage(img, 0, 0);
				canvas.toBlob((pngBlob) => {
					URL.revokeObjectURL(url);
					if (pngBlob) resolve(pngBlob);
					else reject(new Error("Canvas toBlob returned null"));
				}, "image/png");
			};
			
			img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image for conversion")); };
			img.src = url;
		});
	}

	private async deleteMediaFile(item: LayoutItem): Promise<void> {
		try {
			// Trash the sidecar first (if it exists)
			if (item.sidecarFile) {
				await this.app.fileManager.trashFile(item.sidecarFile);
			}

			await this.app.fileManager.trashFile(item.mediaFile);

			if (item.el) { item.el.remove(); item.el = null; }

			this.layoutItems = this.layoutItems.filter(i => i !== item);
			this.computePositions();
			this.syncDOM();
		} catch (e) {
			console.error("Failed to delete media file", e);
			new Notice("Failed to delete file");
		}
	}

	private getMimeType(ext: string): string {
		const map: Record<string, string> = {
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			webp: "image/webp",
			svg: "image/svg+xml",
			bmp: "image/bmp",
			mp4: "video/mp4",
			webm: "video/webm",
			ogv: "video/ogg",
		};
		return map[ext.toLowerCase()] || "application/octet-stream";
	}

	private async openInSidebar(mediaFile: TFile): Promise<void> {
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
			state: { file: mediaFile.path },
		});

		workspace.revealLeaf(leaf);
	}

	onunload(): void {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.resizeObserver.disconnect();
		this.clearDOM();
	}
}

export function getWaterfallViewOptions(): any[] {
	return [
		{
			type: "group",
			displayName: "Layout",
			items: [
				{
					type: "slider",
					key: "columnWidth",
					displayName: "Column width",
					default: 200,
					min: 80,
					max: 600,
					step: 10,
					instant: true,
				},
				{
					type: "slider",
					key: "gap",
					displayName: "Gap",
					default: 8,
					min: 0,
					max: 24,
					step: 2,
					instant: true,
				},
				{
					type: "toggle",
					key: "showFilename",
					displayName: "Show filename",
					default: true,
				},
				{
					type: "toggle",
					key: "showProperties",
					displayName: "Show properties",
					default: false,
				},
			],
		},
		{
			type: "group",
			displayName: "Search",
			items: [
				{
					type: "text",
					key: "searchQuery",
					displayName: "Search",
					default: "",
					placeholder: "Filter by name or path…",
					instant: true,
				},
			],
		},
		{
			type: "group",
			displayName: "Media Filters",
			items: [
				{
					type: "dropdown",
					key: "filterShape",
					displayName: "Shape",
					default: "",
					options: {
						"": "Any",
						"square": "Square",
						"horizontal": "Horizontal",
						"vertical": "Vertical",
					},
				},
				{
					type: "text",
					key: "filterColor",
					displayName: "Colour (hex)",
					default: "",
					placeholder: "#ff0000",
				},
				{
					type: "slider",
					key: "colorThreshold",
					displayName: "Colour proximity (%)",
					default: 50,
					min: 1,
					max: 100,
					step: 1,
				},
				{
					type: "text",
					key: "filterMinWidth",
					displayName: "Min width (px)",
					default: "",
					placeholder: "0",
				},
				{
					type: "text",
					key: "filterMaxWidth",
					displayName: "Max width (px)",
					default: "",
					placeholder: "0",
				},
				{
					type: "text",
					key: "filterMinHeight",
					displayName: "Min height (px)",
					default: "",
					placeholder: "0",
				},
				{
					type: "text",
					key: "filterMaxHeight",
					displayName: "Max height (px)",
					default: "",
					placeholder: "0",
				},
			],
		},
	];
}
