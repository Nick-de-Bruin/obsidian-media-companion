// The tags in the frontmatter that are reserved for other purposes
// such as image width and height
export const reservedImageTags: string[] = ["MC-size", "MC-colors"];

export const reservedFrontMatterTags: string[] = [...new Set([
	...reservedImageTags,
	"MC-last-updated",
])];

// The frontmatter tag used by obsidian to store tags
export const tagsTag = "tags";
