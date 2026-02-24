export interface MediaCompanionSettings {
	hideSidecar: boolean;
	extensions: string[];
	sidecarTemplate: string;

	apiEnabled: boolean;
	apiPort: number;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MediaCompanionSettings = {
	hideSidecar: true,
	extensions: [
		'png',
		'jpg',
		'jpeg',
		'bmp',
		'avif',
		'webp',
		'gif',
		'mp4',
		'webm',
		'ogv',
		'mov',
	],
	sidecarTemplate: "",

	apiEnabled: false,
	apiPort: 27124,
	apiKey: "",
}
