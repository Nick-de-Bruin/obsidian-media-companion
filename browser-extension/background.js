// Obsidian Media Companion – Background Script
// Registers a context-menu item on images and passes data to the popup.

const PENDING_KEY = "mc_pending_image";

// (Re)create context menu on install / update
browser.runtime.onInstalled.addListener(() => {
	browser.contextMenus.removeAll().then(() => {
		browser.contextMenus.create({
			id: "save-to-obsidian",
			title: "Save Image to Obsidian",
			contexts: ["image"],
		});
	});
});

browser.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId !== "save-to-obsidian") return;

	browser.storage.local
		.set({
			[PENDING_KEY]: {
				imageUrl: info.srcUrl,
				pageUrl: tab?.url ?? "",
				pageTitle: tab?.title ?? "",
			},
		})
		.then(() => {
			// Open the popup as a small standalone window so the user
			// can fill in folder / tags immediately.
			browser.windows.create({
				url: browser.runtime.getURL("popup/popup.html"),
				type: "popup",
				width: 420,
				height: 600,
			});
		});
});
