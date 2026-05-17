let lastRightClickedElement = null;

document.addEventListener('contextmenu', (e) => {
  lastRightClickedElement = e.target;
}, true);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_IMAGE_ALT') {
    let alt = '';
    if (lastRightClickedElement && lastRightClickedElement.tagName === 'IMG' && lastRightClickedElement.src === request.srcUrl) {
      alt = lastRightClickedElement.alt;
    } else {
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src === request.srcUrl) {
          alt = img.alt;
          break;
        }
      }
    }
    sendResponse({ alt: alt });
  }
});

chrome.storage.sync.get({ remixStudioDomain: 'http://localhost:3000' }, (config) => {
  const domain = config.remixStudioDomain;
  if (!window.location.href.startsWith(domain + '/import')) return;

  chrome.storage.local.get(['extensionImportData'], (result) => {
    if (result.extensionImportData) {
      const sendData = () => {
        window.postMessage({
          type: 'REMIX_STUDIO_EXTENSION_IMPORT',
          payload: result.extensionImportData
        }, '*');
      };

      sendData();

      let count = 0;
      const interval = setInterval(() => {
        sendData();
        count++;
        if (count > 10) clearInterval(interval);
      }, 300);

      window.addEventListener('message', (event) => {
        if (event.data?.type === 'REMIX_STUDIO_EXTENSION_ACK') {
          clearInterval(interval);
          chrome.storage.local.remove('extensionImportData');
        }
      });
    }
  });
});
