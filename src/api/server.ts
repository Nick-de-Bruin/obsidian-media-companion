import { Notice, Platform, type App, type TFolder } from "obsidian";
import type MediaCompanion from "main";
import type Cache from "../cache";
import Sidecar from "../model/sidecar";

interface UploadRequest {
	imageBase64: string;
	filename: string;
	folder: string;
	tags: string[];
	sourceUrl: string;
	sourceTitle: string;
}

export default class ApiServer {
	private server: ReturnType<typeof import("http").createServer> | null = null;
	private app: App;
	private plugin: MediaCompanion;
	private cache: Cache;

	constructor(app: App, plugin: MediaCompanion, cache: Cache) {
		this.app = app;
		this.plugin = plugin;
		this.cache = cache;
	}

	/**
	 * Start the API server. Only works on desktop platforms.
	 */
	public start(): void {
		if (!Platform.isDesktopApp) {
			console.debug("[Media Companion API] Skipping server start on mobile");
			return;
		}
		if (!this.plugin.settings.apiEnabled) return;
		if (this.server) return;

		try {
			// Dynamic require so mobile builds never evaluate this
			const http: typeof import("http") = require("http");

			this.server = http.createServer(async (req, res) => {
				try {
					await this.handleRequest(req, res);
				} catch (e) {
					console.error("[Media Companion API] Unhandled request error:", e);
					this.sendJson(res, 500, { error: "Internal server error" });
				}
			});

			this.server.listen(this.plugin.settings.apiPort, "127.0.0.1", () => {
				console.log(
					`[Media Companion API] Listening on http://127.0.0.1:${this.plugin.settings.apiPort}`
				);
				new Notice(
					`Media Companion API started on port ${this.plugin.settings.apiPort}`
				);
			});

			this.server.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					console.error(
						`[Media Companion API] Port ${this.plugin.settings.apiPort} already in use`
					);
					new Notice(
						`Media Companion API: Port ${this.plugin.settings.apiPort} is already in use`
					);
				} else {
					console.error("[Media Companion API] Server error:", err);
					new Notice(`Media Companion API error: ${err.message}`);
				}
				this.server = null;
			});
		} catch (e) {
			console.error("[Media Companion API] Failed to start:", e);
		}
	}

	public stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	public restart(): void {
		this.stop();
		this.start();
	}

	private async handleRequest(
		req: import("http").IncomingMessage,
		res: import("http").ServerResponse
	): Promise<void> {
		// allow the browser extension (or any local tool) to connect
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization"
		);

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		// API key check (if configured)
		if (this.plugin.settings.apiKey) {
			const auth = req.headers["authorization"] ?? "";
			if (auth !== `Bearer ${this.plugin.settings.apiKey}`) {
				this.sendJson(res, 401, { error: "Unauthorized" });
				return;
			}
		}

		const url = new URL(
			req.url ?? "/",
			`http://127.0.0.1:${this.plugin.settings.apiPort}`
		);
		const pathname = url.pathname;

		if (pathname === "/api/ping" && req.method === "GET") {
			this.handlePing(res);
		} else if (pathname === "/api/folders" && req.method === "GET") {
			this.handleFolders(res);
		} else if (pathname === "/api/tags" && req.method === "GET") {
			this.handleTags(res);
		} else if (pathname === "/api/upload" && req.method === "POST") {
			const body = await this.readBody(req);
			await this.handleUpload(body, res);
		} else {
			this.sendJson(res, 404, { error: "Not found" });
		}
	}

	private handlePing(res: import("http").ServerResponse): void {
		this.sendJson(res, 200, {
			status: "ok",
			vault: this.app.vault.getName(),
		});
	}

	private handleFolders(res: import("http").ServerResponse): void {
		const folders: string[] = [];

		const collect = (folder: TFolder) => {
			if (folder.path) {
				folders.push(folder.path);
			}
			for (const child of folder.children) {
				if ("children" in child) {
					collect(child as TFolder);
				}
			}
		};

		collect(this.app.vault.getRoot());

		this.sendJson(res, 200, { folders: folders.sort() });
	}

	private handleTags(res: import("http").ServerResponse): void {
		const tags = Object.keys(this.cache.tags).sort();
		this.sendJson(res, 200, { tags });
	}

	private async handleUpload(
		bodyStr: string,
		res: import("http").ServerResponse
	): Promise<void> {
		let body: UploadRequest;
		try {
			body = JSON.parse(bodyStr);
		} catch {
			this.sendJson(res, 400, { error: "Invalid JSON" });
			return;
		}

		if (!body.imageBase64 || !body.filename) {
			this.sendJson(res, 400, {
				error: "Missing required fields: imageBase64, filename",
			});
			return;
		}

		// Sanitize inputs
		const sanitizedName = body.filename.replace(/[\\/:*?"<>|]/g, "_");
		const folder = (body.folder ?? "").replace(/^\/+|\/+$/g, "");
		const filePath = folder ? `${folder}/${sanitizedName}` : sanitizedName;
		const sidecarPath = `${filePath}${Sidecar.EXTENSION}`;

		if (this.app.vault.getFileByPath(filePath)) {
			this.sendJson(res, 409, {
				error: "File already exists",
				path: filePath,
			});
			return;
		}

		try {
			if (folder) {
				const existing = this.app.vault.getAbstractFileByPath(folder);
				if (!existing) {
					await this.app.vault.createFolder(folder);
				}
			}

			const sidecarContent = this.buildSidecarContent(body);

			// Create the sidecar FIRST so the mutation handler picks it up
			// when it processes the new image
			await this.app.vault.create(sidecarPath, sidecarContent);

			// Decode base64 to binary and create the image
			const binaryString = atob(body.imageBase64);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			await this.app.vault.createBinary(filePath, bytes.buffer);

			this.sendJson(res, 200, {
				success: true,
				path: filePath,
				sidecarPath,
			});
		} catch (e: any) {
			console.error("[Media Companion API] Upload error:", e);
			this.sendJson(res, 500, {
				error: e?.message ?? "Upload failed",
			});
		}
	}

	private buildSidecarContent(body: UploadRequest): string {
		const lines: string[] = ["---"];

		if (body.sourceUrl) {
			lines.push(
				`source-url: "${body.sourceUrl.replace(/"/g, '\\"')}"`
			);
		}
		if (body.sourceTitle) {
			lines.push(
				`source-title: "${body.sourceTitle.replace(/"/g, '\\"')}"`
			);
		}

		lines.push(`added: ${new Date().toISOString()}`);

		if (body.tags && body.tags.length > 0) {
			lines.push("tags:");
			for (const tag of body.tags) {
				lines.push(`  - ${tag}`);
			}
		}

		lines.push("---");

		// Append the sidecar template (if any) as body content
		const template = this.plugin.settings.sidecarTemplate?.trim();
		if (template) {
			lines.push("");
			lines.push(template);
		}

		return lines.join("\n") + "\n";
	}

	private readBody(req: import("http").IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = "";
			let size = 0;
			const MAX_BODY_SIZE = 100 * 1024 * 1024; // 100 MB

			req.on("data", (chunk: any) => {
				const str =
					typeof chunk === "string" ? chunk : chunk.toString();
				size += str.length;

				if (size > MAX_BODY_SIZE) {
					req.destroy();
					reject(new Error("Request body too large"));
					return;
				}

				body += str;
			});

			req.on("end", () => resolve(body));
			req.on("error", reject);
		});
	}

	private sendJson(
		res: import("http").ServerResponse,
		status: number,
		data: object
	): void {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(data));
	}
}
