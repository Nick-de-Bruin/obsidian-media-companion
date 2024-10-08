import type { App, TFile } from "obsidian";

/** 
 * Represents a sidecar file for a media file
 */
export default class Sidecar {
    public mediaFile!: TFile;
    public file!: TFile;
    protected app!: App;

    private constructor() { }

    /**
     * Create a new sidecar file and link it to a media file
     * @param file The media file to link it to
     * @param app The app instance
     * @returns The created sidecar
     */
    public static async create(mediaFile: TFile, app: App): Promise<Sidecar> {
        let file = new Sidecar();
        
        file.mediaFile = mediaFile;
        file.app = app;

        await file.fill();

        return file;
    }

    /**
     * Fill the sidecar with its metadata
     * @param file The media file to use for filling
     * @param app The app instance
     */
    protected async fill() {
        this.file = await this.createIfNotExists();
    }

    /**
     * Create a sidecar file if it does not exist yet
     * @param app The app instance
     * @returns The already existing or newly created sidecar file
     */
    private async createIfNotExists(): Promise<TFile> {
        let file = this.app.vault.getFileByPath(`${this.mediaFile.path}.md`) ?? 
            await this.app.vault.create(`${this.mediaFile.path}.md`, "");

        return file;
    }

    /**
     * Finds all tags in the file: Both the frontmatter and the body, and returns
     * them without duplicates and hashtags.
     * @param cache The metadata cache of the file
     * @returns The tags, without hashtags and duplicates
     */
    public getTags(): string[] {
        let cache = this.app.metadataCache.getFileCache(this.file);
        
        if (!cache) return [];

        let tags = cache.tags?.map(t => t.tag) ?? [];

        const fmTags = cache.frontmatter?.tags ?? [];

        if (Array.isArray(fmTags)) {
            tags = tags.concat(fmTags);
        } else {
            tags.push(fmTags);
        }

        // We make it lowercase here and remove dupes;
        // For search reasons, we're going to ignore case sensitivity
        tags = tags.map(t => t.toLowerCase());
        tags = [...new Set(tags)];

        // Remove the leading hash
        return tags.map(t => t.startsWith("#") ? t.slice(1) : t);
    }

    /**
     * Gets the information from a tag in the frontmatter
     * @param tag The tag to get from the frontmatter
     * @param app The app instance
     * @returns The data in the tag, or undefined if it does not exist
     */
    public getFrontmatterTag(tag: string): any | undefined {
        const cache = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
        if (!cache) return undefined;
        
        return cache[tag];
    }

    /** 
     * Sets the information in a tag in the frontmatter
     * @param tag The tag to set in the frontmatter
     * @param value The value to set
     * @param app The app instance
     */
    public async setFrontmatterTag(tag: string, value: any, 
        type: "text" | "multitext" | "number" | "checkbox" | "date" | "datetime" | "aliases" | "tags" | undefined = undefined): Promise<void> {
        try {
            await this.app.fileManager.processFrontMatter(this.file, (fm) => fm[tag] = value);
            
            if (type) {
                // @ts-ignore
                this.app.metadataTypeManager.properties[tag.toLowerCase()].type = type;
            }
        } catch (e) {
            console.log(e);
        }
    }
}