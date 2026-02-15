/**
 * The supported media types for the plugin
 */
export enum MediaTypes {
	Image = "image",
	Video = "video",
	Unknown = "unknown",
}

/**
 * Finds the media type of a file based on its extension
 * @param extension The extension of the file
 * @returns The media type of the file
 */
export function getMediaType(extension: string): MediaTypes {
	switch (extension.toLowerCase()) {
		case "png":
		case "jpg":
		case "jpeg":
		case "webp":
		case "avif":
		case "bmp":
		case "gif":
			return MediaTypes.Image;
		case "mp4":
		case "webm":
		case "ogv":
		case "mov":
			return MediaTypes.Video;
		default:
			return MediaTypes.Unknown;
	}
}
