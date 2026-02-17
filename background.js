// Background script for Nubra AI Assistant
chrome.runtime.onInstalled.addListener(() => {
  console.log('Nubra AI Assistant installed');
  chrome.contextMenus.create({
    id: 'nubra-convert-selection',
    title: 'Convert with Nubra AI',
    contexts: ['selection']
  });
});

async function callBackendEndpoint(path, payload) {
  const endpoints = [
    `https://nubra-code-converter-backend.vercel.app${path}`,
    `http://localhost:3000${path}`,
    `http://127.0.0.1:3000${path}`,
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data && data.message ? data.message : `HTTP ${response.status}`;
        throw new Error(message);
      }

      return { ok: true, data };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    error: lastError ? lastError.message : 'Could not reach local backend on port 3000.'
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const endpointPath =
    request.action === 'convertCode'
      ? '/convert'
      : request.action === 'chatQuery'
        ? '/chat'
        : null;

  if (!endpointPath) return false;

  callBackendEndpoint(endpointPath, request.payload)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || 'Conversion request failed.' });
    });

  return true;
});

// Handle extension icon click - toggle sidebar
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, sending message to tab:', tab.id);
  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }).catch((error) => {
    console.log('Error sending message:', error);
    // Content script might not be loaded yet, ignore error
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'nubra-convert-selection') return;
  if (!tab || typeof tab.id !== 'number') return;
  const selectedText = (info.selectionText || '').trim();
  if (!selectedText) return;

  const payload = {
    action: 'captureSelectionForNubra',
    payload: { text: selectedText }
  };

  const sendToTab = () => chrome.tabs.sendMessage(tab.id, payload);

  sendToTab().catch(async (error) => {
    console.log('Initial selection capture failed, attempting injection:', error);
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await sendToTab();
    } catch (retryError) {
      console.log('Failed to capture selection after injection retry:', retryError);
    }
  });
});
