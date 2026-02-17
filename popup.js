// Popup script for Nubra AI Assistant
function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs && tabs[0]);
    });
  });
}

function sendToggleMessage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'toggleSidebar' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const openSidebarBtn = document.getElementById('openSidebarBtn');

  if (!openSidebarBtn) {
    console.error('Open sidebar button not found');
    return;
  }

  openSidebarBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    try {
      const activeTab = await queryActiveTab();
      if (!activeTab || typeof activeTab.id !== 'number') {
        throw new Error('No active tab found');
      }

      try {
        await sendToggleMessage(activeTab.id);
      } catch (sendError) {
        if (sendError.message.includes('Receiving end does not exist')) {
          console.error('Content script is not ready on this tab. Reload the page once and try again.');
          return;
        }
        throw sendError;
      }

      window.close();
    } catch (error) {
      console.error('Failed to open sidebar:', error);
    }
  });
});
