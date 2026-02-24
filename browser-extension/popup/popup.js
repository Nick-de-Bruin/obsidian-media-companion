const STORAGE_KEY = "mc_settings";
const PENDING_KEY = "mc_pending_image";

let settings = {
	host: "http://127.0.0.1",
	port: 27124,
	apiKey: "",
	defaultFolder: "",
};

let folders      = [];
let allTags      = [];
let selectedTags = [];
let connected    = false;
let pendingImage = null;

let dom = {};

document.addEventListener("DOMContentLoaded", async () => {
	dom = {
		settingsView:     document.getElementById("settings-view"),
		saveView:         document.getElementById("save-view"),
		settingsBtn:      document.getElementById("settings-btn"),
		backBtn:          document.getElementById("back-btn"),

		hostInput:        document.getElementById("host-input"),
		portInput:        document.getElementById("port-input"),
		apiKeyInput:      document.getElementById("api-key-input"),
		testBtn:          document.getElementById("test-connection"),
		connectionStatus: document.getElementById("connection-status"),
		saveSettingsBtn:  document.getElementById("save-settings"),

		imagePreview:     document.getElementById("image-preview"),
		previewContainer: document.getElementById("preview-container"),
		previewLoading:   document.getElementById("preview-loading"),
		filenameInput:    document.getElementById("filename-input"),
		folderInput:      document.getElementById("folder-input"),
		folderDropdown:   document.getElementById("folder-dropdown"),
		tagField:         document.getElementById("tag-field"),
		tagInput:         document.getElementById("tag-input"),
		tagDropdown:      document.getElementById("tag-dropdown"),
		tagContainer:     document.getElementById("tag-container"),
		sourceInfo:       document.getElementById("source-info"),
		saveBtn:          document.getElementById("save-btn"),
		statusEl:         document.getElementById("status"),
		vaultName:        document.getElementById("vault-name"),
	};

	await loadSettings();
	await checkPendingImage();
	setupEventListeners();

	if (pendingImage) {
		showSaveView();
		await connectAndLoadData();
	} else {
		showSettingsView();
	}
});

async function loadSettings() {
	try {
		const data = await browser.storage.local.get(STORAGE_KEY);
		if (data[STORAGE_KEY]) settings = { ...settings, ...data[STORAGE_KEY] };
	} catch (e) {
		console.error("Failed to load settings:", e);
	}
	dom.hostInput.value   = settings.host;
	dom.portInput.value   = settings.port;
	dom.apiKeyInput.value = settings.apiKey;
}

async function persistSettings() {
	settings.host   = dom.hostInput.value.trim();
	settings.port   = parseInt(dom.portInput.value, 10) || 27124;
	settings.apiKey = dom.apiKeyInput.value.trim();
	await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

async function checkPendingImage() {
	try {
		const data = await browser.storage.local.get(PENDING_KEY);
		if (data[PENDING_KEY]) {
			pendingImage = data[PENDING_KEY];
			await browser.storage.local.remove(PENDING_KEY);
		}
	} catch (e) {
		console.error("Failed to read pending image:", e);
	}
}

function getApiBase() { return `${settings.host}:${settings.port}`; }

function getHeaders() {
	const h = { "Content-Type": "application/json" };
	if (settings.apiKey) h["Authorization"] = `Bearer ${settings.apiKey}`;
	return h;
}

async function apiRequest(path, opts = {}) {
	return fetch(`${getApiBase()}${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers } });
}

async function testConnection() {
	dom.testBtn.disabled = true;
	dom.connectionStatus.textContent = "Connecting…";
	dom.connectionStatus.className   = "status connecting";

	try {
		const res  = await apiRequest("/api/ping");
		const data = await res.json();
		if (data.status === "ok") {
			dom.connectionStatus.textContent = `Connected — vault: ${data.vault}`;
			dom.connectionStatus.className   = "status success";
			connected = true;
		} else {
			dom.connectionStatus.textContent = "Unexpected response";
			dom.connectionStatus.className   = "status error";
			connected = false;
		}
	} catch {
		dom.connectionStatus.textContent = "Cannot connect. Is Obsidian running with the API enabled?";
		dom.connectionStatus.className   = "status error";
		connected = false;
	}
	dom.testBtn.disabled = false;
}

async function connectAndLoadData() {
	try {
		const pingRes  = await apiRequest("/api/ping");
		const pingData = await pingRes.json();
		if (pingData.status !== "ok") { showStatus("Cannot connect to Obsidian", "error"); return; }

		connected = true;
		dom.vaultName.textContent = pingData.vault;

		const [foldersRes, tagsRes] = await Promise.all([apiRequest("/api/folders"), apiRequest("/api/tags")]);
		folders = (await foldersRes.json()).folders ?? [];
		allTags = (await tagsRes.json()).tags ?? [];

		prefillFromPending();
	} catch {
		showStatus("Failed to connect. Check settings.", "error");
	}
}

function prefillFromPending() {
	if (!pendingImage) return;

	dom.imagePreview.classList.remove("loaded");
	dom.previewLoading.style.display = "flex";
	dom.imagePreview.onload = () => {
		dom.imagePreview.classList.add("loaded");
		dom.previewLoading.style.display = "none";
	};
	dom.imagePreview.onerror = () => {
		dom.previewLoading.textContent = "Preview unavailable";
	};
	dom.imagePreview.src = pendingImage.imageUrl;

	dom.filenameInput.value = extractFilename(pendingImage.imageUrl);
	if (settings.defaultFolder) dom.folderInput.value = settings.defaultFolder;

	if (pendingImage.pageTitle || pendingImage.pageUrl) {
		const parts = [];
		if (pendingImage.pageTitle) parts.push(pendingImage.pageTitle);
		if (pendingImage.pageUrl) parts.push(pendingImage.pageUrl);
		dom.sourceInfo.textContent = `Source: ${parts.join(" — ")}`;
	}
}

function extractFilename(url) {
	if (!url) return "image.png";
	if (url.startsWith("data:")) {
		const ext = (url.split(";")[0].split(":")[1] || "image/png").split("/")[1] || "png";
		return `image_${Date.now()}.${ext}`;
	}
	try {
		let name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
		name = name.split("?")[0];
		return name && name.includes(".") ? name : `image_${Date.now()}.png`;
	} catch {
		return `image_${Date.now()}.png`;
	}
}

/**
 * Creates a keyboard-navigable autocomplete controller.
 * @param {object} opts
 * @param {HTMLInputElement} opts.input The text input element
 * @param {HTMLElement} opts.dropdown The dropdown container element
 * @param {() => string[]} opts.getItems Returns the full list of items to filter
 * @param {(item: string) => void} opts.onSelect Called when an item is chosen
 * @param {boolean} [opts.allowNew=false] Allow committing the typed value even if not in the list
 */
function createAutocomplete({ input, dropdown, getItems, onSelect, allowNew = false }) {
	let activeIndex = -1;
	let currentItems = [];

	function render(query) {
		const q = query.toLowerCase();
		currentItems = q
			? getItems().filter(i => i.toLowerCase().includes(q)).slice(0, 15)
			: getItems().slice(0, 15);
		activeIndex = -1;
		dropdown.innerHTML = "";

		if (currentItems.length === 0) {
			if (q && allowNew) {
				const hint = document.createElement("div");
				hint.className = "ac-empty";
				hint.textContent = `Press Enter to add "${query}"`;
				dropdown.appendChild(hint);
			} else if (q) {
				const hint = document.createElement("div");
				hint.className = "ac-empty";
				hint.textContent = "No matches";
				dropdown.appendChild(hint);
			}
			show();
			return;
		}

		for (let i = 0; i < currentItems.length; i++) {
			const item = currentItems[i];
			const div = document.createElement("div");
			div.className = "ac-item";
			div.setAttribute("role", "option");
			div.dataset.index = i;

			if (q) {
				const idx = item.toLowerCase().indexOf(q);
				if (idx >= 0) {
					div.appendChild(document.createTextNode(item.substring(0, idx)));
					const mark = document.createElement("span");
					mark.className = "ac-match";
					mark.textContent = item.substring(idx, idx + q.length);
					div.appendChild(mark);
					div.appendChild(document.createTextNode(item.substring(idx + q.length)));
				} else {
					div.textContent = item;
				}
			} else {
				div.textContent = item;
			}

			div.addEventListener("mousedown", (e) => {
				e.preventDefault();
				selectItem(i);
			});
			div.addEventListener("mouseenter", () => {
				setActive(i);
			});
			dropdown.appendChild(div);
		}
		show();
	}

	function show() {
		dropdown.classList.add("open");
		input.setAttribute("aria-expanded", "true");
	}

	function hide() {
		dropdown.classList.remove("open");
		input.setAttribute("aria-expanded", "false");
		activeIndex = -1;
	}

	function setActive(idx) {
		const items = dropdown.querySelectorAll(".ac-item");
		items.forEach(el => el.classList.remove("active"));
		activeIndex = idx;
		if (idx >= 0 && idx < items.length) {
			items[idx].classList.add("active");
			items[idx].scrollIntoView({ block: "nearest" });
		}
	}

	function selectItem(idx) {
		if (idx >= 0 && idx < currentItems.length) {
			onSelect(currentItems[idx]);
		}
		hide();
	}

	function commitTyped() {
		if (activeIndex >= 0 && activeIndex < currentItems.length) {
			onSelect(currentItems[activeIndex]);
			hide();
			return true;
		}

		const val = input.value.trim();
		if (!val) return false;

		if (allowNew) {
			onSelect(val);
			hide();
			return true;
		}

		if (currentItems.length === 1) {
			onSelect(currentItems[0]);
			hide();
			return true;
		}

		return false;
	}

	input.addEventListener("input", () => {
		render(input.value.trim());
	});

	input.addEventListener("focus", () => {
		render(input.value.trim());
	});

	input.addEventListener("keydown", (e) => {
		const isOpen = dropdown.classList.contains("open");
		const count = currentItems.length;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (!isOpen) { render(input.value.trim()); return; }
			setActive(activeIndex < count - 1 ? activeIndex + 1 : 0);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (!isOpen) return;
			setActive(activeIndex > 0 ? activeIndex - 1 : count - 1);
		} else if (e.key === "Enter") {
			// Always try to commit if dropdown is open OR there's a highlighted item
			if (activeIndex >= 0 || isOpen) {
				e.preventDefault();
				e.stopPropagation();
				commitTyped();
			}
		} else if (e.key === "Tab") {
			if (isOpen && activeIndex >= 0) {
				e.preventDefault();
				selectItem(activeIndex);
			} else if (isOpen && currentItems.length === 1) {
				e.preventDefault();
				selectItem(0);
			}
		} else if (e.key === "Escape") {
			if (isOpen) { e.preventDefault(); e.stopPropagation(); hide(); }
		}
	});

	document.addEventListener("mousedown", (e) => {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			hide();
		}
	});

	return { render, hide, commitTyped };
}

let folderAC;

function setupFolderAutocomplete() {
	folderAC = createAutocomplete({
		input: dom.folderInput,
		dropdown: dom.folderDropdown,
		getItems: () => ["", ...folders],  // "" = vault root
		onSelect: (item) => {
			dom.folderInput.value = item;
		},
		allowNew: false,
	});
}

let tagAC;

function setupTagAutocomplete() {
	tagAC = createAutocomplete({
		input: dom.tagInput,
		dropdown: dom.tagDropdown,
		getItems: () => allTags.filter(t => !selectedTags.includes(t)),
		onSelect: (tag) => {
			addTag(tag);
			dom.tagInput.value = "";
		},
		allowNew: true,
	});

	dom.tagField.addEventListener("click", () => dom.tagInput.focus());

	dom.tagInput.addEventListener("keydown", (e) => {
		if (e.key === "Backspace" && dom.tagInput.value === "" && selectedTags.length > 0) {
			removeTag(selectedTags[selectedTags.length - 1]);
		}
	});
}

function addTag(tag) {
	tag = tag.toLowerCase().replace(/^#/, "").trim();
	if (!tag || selectedTags.includes(tag)) return;
	selectedTags.push(tag);
	renderTags();
}

function removeTag(tag) {
	selectedTags = selectedTags.filter(t => t !== tag);
	renderTags();
}

function renderTags() {
	dom.tagContainer.innerHTML = "";
	for (const tag of selectedTags) {
		const chip = document.createElement("span");
		chip.className = "tag-chip";

		const label = document.createElement("span");
		label.className = "tag-label";
		label.textContent = tag;
		chip.appendChild(label);

		const btn = document.createElement("button");
		btn.className = "tag-remove";
		btn.textContent = "\u00d7";
		btn.title = `Remove ${tag}`;
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			removeTag(tag);
			dom.tagInput.focus();
		});
		chip.appendChild(btn);

		dom.tagContainer.appendChild(chip);
	}
}

async function handleSave() {
	if (!pendingImage) { showStatus("No image to save", "error"); return; }
	if (!connected) { showStatus("Not connected to Obsidian", "error"); return; }

	const filename = dom.filenameInput.value.trim();
	if (!filename) { showStatus("Enter a filename", "error"); dom.filenameInput.focus(); return; }

	dom.saveBtn.disabled = true;
	dom.saveBtn.querySelector(".btn-label").textContent = "Saving…";
	dom.saveBtn.style.pointerEvents = "none";
	showStatus("Downloading image…", "info");

	try {
		let imageBase64;
		if (pendingImage.imageUrl.startsWith("data:")) {
			imageBase64 = pendingImage.imageUrl.split(",")[1];
		} else {
			const imgRes = await fetch(pendingImage.imageUrl);
			if (!imgRes.ok) throw new Error(`Image download failed (${imgRes.status})`);
			imageBase64 = await blobToBase64(await imgRes.blob());
		}

		showStatus("Uploading to Obsidian…", "info");

		const payload = {
			imageBase64,
			filename,
			folder: dom.folderInput.value.trim(),
			tags: selectedTags,
			sourceUrl:   pendingImage.pageUrl   || "",
			sourceTitle: pendingImage.pageTitle  || "",
		};

		const res    = await apiRequest("/api/upload", { method: "POST", body: JSON.stringify(payload) });
		const result = await res.json();

		if (result.success) {
			settings.defaultFolder = dom.folderInput.value.trim();
			await browser.storage.local.set({ [STORAGE_KEY]: settings });
			pendingImage = null;
			window.close();
		} else {
			showStatus(result.error || "Upload failed", "error");
		}
	} catch (e) {
		showStatus(`Error: ${e.message}`, "error");
	} finally {
		dom.saveBtn.disabled = false;
		dom.saveBtn.style.pointerEvents = "";
		dom.saveBtn.querySelector(".btn-label").textContent = "Save to Obsidian";
	}
}

function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload  = () => resolve(/** @type {string} */ (reader.result).split(",")[1]);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function showSaveView() {
	dom.settingsView.style.display = "none";
	dom.saveView.style.display     = "block";
}

function showSettingsView() {
	dom.saveView.style.display     = "none";
	dom.settingsView.style.display = "block";
}

function showStatus(msg, type) {
	dom.statusEl.textContent = msg;
	dom.statusEl.className   = `status ${type}`;
}

function setupEventListeners() {
	dom.settingsBtn.addEventListener("click", showSettingsView);
	dom.backBtn.addEventListener("click", () => { if (pendingImage) showSaveView(); });

	dom.testBtn.addEventListener("click", async () => {
		await persistSettings();
		await testConnection();
	});
	dom.saveSettingsBtn.addEventListener("click", async () => {
		await persistSettings();
		showStatus("Settings saved", "success");
		if (pendingImage) {
			showSaveView();
			await connectAndLoadData();
		}
	});

	setupFolderAutocomplete();
	setupTagAutocomplete();

	dom.saveBtn.addEventListener("click", handleSave);

	// ctrl + enter
	document.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (dom.saveView.style.display !== "none") handleSave();
		}
	});
}
