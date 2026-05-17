const saveOptions = () => {
  let domain = document.getElementById('domain').value.trim();
  if (domain.endsWith('/')) {
    domain = domain.slice(0, -1);
  }
  
  if (!domain) {
    domain = 'http://localhost:3000';
  }

  chrome.storage.sync.set(
    { remixStudioDomain: domain },
    () => {
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 3000);
    }
  );
};

const restoreOptions = () => {
  chrome.storage.sync.get(
    { remixStudioDomain: 'http://localhost:3000' },
    (items) => {
      document.getElementById('domain').value = items.remixStudioDomain;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
