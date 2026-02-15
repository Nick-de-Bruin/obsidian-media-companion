import {
	debounce,
	FileView,
	normalizePath,
	TFile,
	type WorkspaceLeaf,
} from "obsidian";
import type { WidgetEditorView } from "obsidian-typings";
import Sidecar from "../model/sidecar";
import { getMediaType, MediaTypes } from "../model/types/mediaTypes";

export const VIEW_TYPE_SIDECAR = "mc-sidecar";

const ILLEGAL_FILENAMES = [
	"CON", "PRN", "AUX", "NUL",
	"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
	"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
	".", "..",
];

const ILLEGAL_FILENAME_CHARACTERS = [
	"/", "<", ">", ":", "\"", "\\", "|", "?", "*", "[", "]", "^", "#",
];

/**
 * A FileView that displays a media preview at the top with an embedded
 * markdown editor for the associated sidecar file below it.
 *
 * Media Companion-reserved frontmatter properties (MC-size, MC-colors, MC-last-updated)
 * are hidden via CSS so users cannot accidentally edit them.
 */
export class SidecarView extends FileView {
	private mediaContainerEl!: HTMLElement;
	private renameTitleEl!: HTMLTextAreaElement;
	private titleMessageEl!: HTMLElement;
	private editorContainerEl!: HTMLElement;

	private editorView: WidgetEditorView | null = null;
	private editorObserver: MutationObserver | null = null;
	private sidecarFile: TFile | null = null;
	private fileContent = "";
	private fileContentLastEdited = 0;

	private saveDebounce = debounce(() => this.saveFile(), 500, true);
	private renameDebounce = debounce(() => this.renameFile(), 1000, true);

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_SIDECAR;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Media Companion";
	}

	getIcon(): string {
		return "image";
	}

	canAcceptExtension(extension: string): boolean {
		return getMediaType(extension) !== MediaTypes.Unknown;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mc-sidecar-view");

		this.mediaContainerEl = contentEl.createDiv({ cls: "mc-media-preview" });

		this.renameTitleEl = contentEl.createEl("textarea", { cls: "mc-sidecar-title" });
		this.renameTitleEl.addEventListener("input", () => this.renameDebounce());
		this.renameTitleEl.addEventListener("keydown", (e) => this.onTitleKeyDown(e));
		this.renameTitleEl.hidden = true;

		this.titleMessageEl = contentEl.createEl("p", {
			cls: "mc-sidecar-title-message",
			text: "Invalid filename",
		});
		this.titleMessageEl.hidden = true;

		this.editorContainerEl = contentEl.createDiv({ cls: "mc-sidecar-editor" });

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				if (this.file && file === this.file) {
					const oldBasename = oldPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";

					if (this.renameTitleEl.value === oldBasename) {
						this.renameTitleEl.value = this.file.basename;
					}

					this.sidecarFile = this.app.vault.getFileByPath(
						this.file.path + Sidecar.EXTENSION,
					);
				}
			}),
		);

		// React to external edits of the sidecar file
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (
					file instanceof TFile &&
					this.sidecarFile &&
					file === this.sidecarFile &&
					this.editorView
				) {
					// Skip if we just wrote this file ourselves
					if (Date.now() - this.fileContentLastEdited < 2000) return;

					const content = await this.app.vault.read(this.sidecarFile);
					if (content !== this.editorView.data) {
						this.editorObserver?.disconnect();
						this.editorView.set(content, true);
						this.fileContent = content;
						this.startEditorObserver();
					}
				}
			}),
		);

		if (!this.file) {
			this.showEmptyState();
		}
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.destroyEditor();

		this.sidecarFile = this.app.vault.getFileByPath(
			file.path + Sidecar.EXTENSION,
		);

		this.renderMediaPreview(file);

		this.renameTitleEl.value = file.basename;
		this.renameTitleEl.hidden = false;
		this.titleMessageEl.hidden = true;
		this.renameTitleEl.removeClass("mc-sidecar-title-invalid");

		if (this.sidecarFile) {
			this.editorContainerEl.empty();

			// Pass the real sidecar TFile so the embedded editor can
			// render frontmatter properties with proper file context.
			this.editorView = (this.app as any).embedRegistry.embedByExtension.md(
				{ app: this.app, containerEl: this.editorContainerEl },
				this.sidecarFile, "") as WidgetEditorView;

			this.editorView.editable = true;
			this.editorView.showEditor();

			// Load content for change-tracking
			this.fileContent = await this.app.vault.read(this.sidecarFile);
			this.editorView.set(this.fileContent, true);

			// Wait for the DOM to settle before hiding the inline title
			// and starting the mutation observer (avoids false saves
			// from the initial render).
			requestAnimationFrame(() => {
				if (this.editorView?.inlineTitleEl) {
					this.editorView.inlineTitleEl.style.display = "none";
				}

				this.startEditorObserver();
			});
		} else {
			this.editorContainerEl.empty();
			this.editorContainerEl.createEl("p", {
				text: "No sidecar file found.",
				cls: "mc-sidecar-empty",
			});
		}
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.flushPendingChanges();
		this.destroyEditor();
		this.mediaContainerEl.empty();
		this.sidecarFile = null;
	}

	async onClose(): Promise<void> {
		this.flushPendingChanges();
		this.destroyEditor();
	}

	private renderMediaPreview(file: TFile): void {
		this.mediaContainerEl.empty();
		const resourcePath = this.app.vault.getResourcePath(file);
		const mediaType = getMediaType(file.extension);

		if (mediaType === MediaTypes.Image) {
			this.mediaContainerEl.createEl("img", {
				attr: { src: resourcePath, alt: file.basename },
				cls: "mc-media-element",
			});
		} else if (mediaType === MediaTypes.Video) {
			this.mediaContainerEl.createEl("video", {
				attr: { src: resourcePath, controls: "" },
				cls: "mc-media-element",
			});
		} else {
			const embedCreator = this.app.embedRegistry.getEmbedCreator(file);
			if (embedCreator) {
				const embedEl = this.mediaContainerEl.createDiv();
				
				const embed = embedCreator(
					{ app: this.app, containerEl: embedEl },
					file,
					file.path,
				);

				// @ts-ignore
				if (embed.loadFile) embed.loadFile();
			} else {
				this.mediaContainerEl.createDiv({
					text: file.basename,
					cls: "mc-sidecar-empty",
				});
			}
		}
	}


	private startEditorObserver(): void {
		if (this.editorObserver) this.editorObserver.disconnect();

		this.editorObserver = new MutationObserver(() => {
			this.saveDebounce();
		});
		
		this.editorObserver.observe(this.editorContainerEl, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}

	private destroyEditor(): void {
		if (this.editorObserver) {
			this.editorObserver.disconnect();
			this.editorObserver = null;
		}
		
		this.editorView = null;
	}

	private flushPendingChanges(): void {
		this.saveDebounce.run();
		this.saveDebounce.cancel();
		this.renameDebounce.run();
		this.renameDebounce.cancel();
	}

	private saveFile(): void {
		if (!this.sidecarFile || !this.editorView) return;
		const data = this.editorView.data;
		if (!data || this.fileContent === data) return;
		this.fileContent = data;
		this.fileContentLastEdited = Date.now();
		void this.app.vault.modify(this.sidecarFile, data);
	}

	private renameFile(): void {
		if (!this.file) return;

		const trimmed = this.renameTitleEl.value.trim();
		const parentPath = this.file.parent?.path ?? "";
		
		const newPath = normalizePath(
			parentPath + "/" + trimmed + "." + this.file.extension,
		);

		if (trimmed === this.file.basename) {
			this.setTitleValid();
			return;
		}

		if (
			ILLEGAL_FILENAMES.includes(trimmed) ||
			trimmed.length === 0 ||
			trimmed.endsWith(".")
		) {
			this.setTitleInvalid();
			return;
		}

		if (this.app.vault.getAbstractFileByPathInsensitive(newPath)) {
			this.setTitleInvalid();
			return;
		}

		this.setTitleValid();
		this.app.fileManager.renameFile(this.file, newPath);
	}

	private setTitleInvalid(): void {
		this.renameTitleEl.addClass("mc-sidecar-title-invalid");
		this.titleMessageEl.hidden = false;
	}

	private setTitleValid(): void {
		this.renameTitleEl.removeClass("mc-sidecar-title-invalid");
		this.titleMessageEl.hidden = true;
	}

	private onTitleKeyDown(e: KeyboardEvent): void {
		if (e.key === "Enter") {
			e.preventDefault();
			this.renameTitleEl.blur();
		}
		if (ILLEGAL_FILENAME_CHARACTERS.includes(e.key)) {
			e.preventDefault();
		}
	}

	private showEmptyState(): void {
		this.mediaContainerEl.empty();
		
		this.mediaContainerEl.createEl("h3", {
			text: "No file selected",
			cls: "mc-sidecar-empty",
		});
		
		this.renameTitleEl.hidden = true;
	}
}
