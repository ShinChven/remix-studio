chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "remix-studio-send-image",
    title: "Send image to Remix Studio",
    contexts: ["image"]
  });

  chrome.contextMenus.create({
    id: "remix-studio-send-text",
    title: "Send text to Remix Studio",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "remix-studio-send-image-chat",
    title: "Send image to Remix Studio Chat",
    contexts: ["image"]
  });

  chrome.contextMenus.create({
    id: "remix-studio-send-text-chat",
    title: "Send text to Remix Studio Chat",
    contexts: ["selection"]
  });
});

async function resolveImageTitle(info, tab) {
  let title = "";
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_IMAGE_ALT", srcUrl: info.srcUrl });
    if (response && response.alt) {
      title = response.alt;
    }
  } catch (e) {
    // Content script might not be injected or running
  }

  if (!title) {
    try {
      const url = new URL(info.srcUrl);
      const pathname = url.pathname;
      title = pathname.substring(pathname.lastIndexOf('/') + 1);
    } catch (e) {}
  }
  return title;
}

async function sendImagePayload(info, tab, target) {
  const srcUrl = info.srcUrl;
  if (!srcUrl) return;

  const title = await resolveImageTitle(info, tab);

  const response = await fetch(srcUrl);
  const blob = await response.blob();

  const reader = new FileReader();
  reader.onloadend = () => {
    const base64data = reader.result;

    chrome.storage.local.set({
      extensionImportData: { type: 'image', data: base64data, name: title, target }
    }, () => {
      chrome.storage.sync.get({ remixStudioDomain: 'http://localhost:3000' }, (config) => {
        const path = target === 'chat' ? '/assistant?from=extension' : '/import';
        chrome.tabs.create({ url: config.remixStudioDomain + path });
      });
    });
  };
  reader.readAsDataURL(blob);
}

function sendTextPayload(info, target) {
  const text = info.selectionText;
  if (!text) return;

  chrome.storage.local.set({
    extensionImportData: { type: 'text', data: text, target }
  }, () => {
    chrome.storage.sync.get({ remixStudioDomain: 'http://localhost:3000' }, (config) => {
      const path = target === 'chat' ? '/assistant?from=extension' : '/import';
      chrome.tabs.create({ url: config.remixStudioDomain + path });
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "remix-studio-send-image") {
      await sendImagePayload(info, tab, 'import');
    } else if (info.menuItemId === "remix-studio-send-image-chat") {
      await sendImagePayload(info, tab, 'chat');
    } else if (info.menuItemId === "remix-studio-send-text") {
      sendTextPayload(info, 'import');
    } else if (info.menuItemId === "remix-studio-send-text-chat") {
      sendTextPayload(info, 'chat');
    }
  } catch (e) {
    console.error("Failed to process context menu action:", e);
  }
});
