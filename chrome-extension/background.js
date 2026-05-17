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
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "remix-studio-send-image") {
    try {
      const srcUrl = info.srcUrl;
      if (!srcUrl) return;

      let title = "";
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_IMAGE_ALT", srcUrl: srcUrl });
        if (response && response.alt) {
          title = response.alt;
        }
      } catch (e) {
        // Content script might not be injected or running
      }
      
      if (!title) {
         try {
           const url = new URL(srcUrl);
           const pathname = url.pathname;
           title = pathname.substring(pathname.lastIndexOf('/') + 1);
         } catch(e) {}
      }

      // In MV3 service workers, fetch works perfectly with host_permissions
      const response = await fetch(srcUrl);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        
        chrome.storage.local.set({ 
          extensionImportData: { type: 'image', data: base64data, name: title } 
        }, () => {
          chrome.storage.sync.get({ remixStudioDomain: 'http://localhost:3000' }, (config) => {
            chrome.tabs.create({ url: config.remixStudioDomain + '/import' });
          });
        });
      };
      reader.readAsDataURL(blob);

    } catch (e) {
      console.error("Failed to process image:", e);
    }
  } else if (info.menuItemId === "remix-studio-send-text") {
    const text = info.selectionText;
    if (!text) return;
    
    chrome.storage.local.set({ 
      extensionImportData: { type: 'text', data: text } 
    }, () => {
      chrome.storage.sync.get({ remixStudioDomain: 'http://localhost:3000' }, (config) => {
        chrome.tabs.create({ url: config.remixStudioDomain + '/import' });
      });
    });
  }
});
