// Background script for Nubra AI Assistant
chrome.runtime.onInstalled.addListener(() => {
  console.log('Nubra AI Assistant installed');
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'nubra-convert-selection',
      title: 'Convert with Nubra AI',
      contexts: ['selection', 'editable', 'page']
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'nubra-convert-selection',
      title: 'Convert with Nubra AI',
      contexts: ['selection', 'editable', 'page']
    });
  });
});

async function extractSelectionFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const readFromActiveInput = () => {
          const el = document.activeElement;
          if (!el) return '';
          const isInput = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && typeof el.value === 'string');
          if (!isInput) return '';
          const start = typeof el.selectionStart === 'number' ? el.selectionStart : 0;
          const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : 0;
          if (end > start) return (el.value || '').slice(start, end).trim();
          return '';
        };

        const readWindowSelection = () => {
          const sel = window.getSelection ? window.getSelection() : null;
          return sel ? (sel.toString() || '').trim() : '';
        };

        // CodeMirror 6 fallback (used by modern JupyterLab editors/notebooks).
        const readCodeMirrorSelection = () => {
          const focusedEditor =
            document.querySelector('.cm-editor.cm-focused') ||
            (document.activeElement && document.activeElement.closest ? document.activeElement.closest('.cm-editor') : null) ||
            document.querySelector('.cm-editor');
          if (!focusedEditor) return '';

          const view = focusedEditor.cmView && focusedEditor.cmView.view
            ? focusedEditor.cmView.view
            : focusedEditor.view || null;
          if (!view || !view.state || !view.state.doc || !view.state.selection || !Array.isArray(view.state.selection.ranges)) {
            return '';
          }

          const ranges = view.state.selection.ranges.filter((r) => r && typeof r.from === 'number' && typeof r.to === 'number' && r.from !== r.to);
          if (!ranges.length) return '';

          const pieces = ranges.map((r) => view.state.doc.sliceString(r.from, r.to));
          return pieces.join('\n').trim();
        };

        return readWindowSelection() || readFromActiveInput() || readCodeMirrorSelection() || '';
      }
    });

    for (const entry of results || []) {
      const text = typeof entry.result === 'string' ? entry.result.trim() : '';
      if (text) return text;
    }
  } catch (error) {
    console.log('Selection extraction via scripting failed:', error);
  }
  return '';
}

async function callBackendEndpoint(path, payload) {
  const endpoints = [
    `https://nubra-ai-assistant-extension.vercel.app${path}`,
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
    error: lastError ? lastError.message : 'Could not reach backend endpoint.'
  };
}

async function callBackendHealth() {
  const endpoints = [
    'https://nubra-ai-assistant-extension.vercel.app/health',
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    error: lastError ? lastError.message : 'Could not reach backend health endpoint.'
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const endpointPath =
    request.action === 'convertCode'
      ? '/convert'
      : request.action === 'chatQuery'
        ? '/chat'
        : null;

  if (request.action === 'checkBackendHealth') {
    callBackendHealth()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || 'Health check failed.' }));
    return true;
  }

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
  (async () => {
    if (info.menuItemId !== 'nubra-convert-selection') return;
    if (!tab || typeof tab.id !== 'number') return;

    let selectedText = (info.selectionText || '').trim();
    if (!selectedText) {
      selectedText = await extractSelectionFromTab(tab.id);
    }
    if (!selectedText) {
      console.log('No selectable text found for Convert with Nubra AI.');
      return;
    }

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
  })();
});

