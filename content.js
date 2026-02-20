// Content script for Nubra AI Assistant
// Injects floating button and sidebar functionality

console.log('Nubra AI Assistant content script loaded');

window.NubraAIAssistant = window.NubraAIAssistant || class NubraAIAssistant {
  constructor() {
    this.isOpen = false;
    this.currentSession = null;
    this.allSessions = [];
    this.activeSessionId = null;
    this.currentView = 'chat'; // 'chat' | 'history'
    this.currentMode = 'convert';
    this.sessionSearchQuery = '';
    this.editingSessionId = null;
    this.defaultSidebarWidth = 450;
    this.sidebarWidth = this.defaultSidebarWidth;
    this.minSidebarWidth = 56;
    this.maxSidebarWidth = 900;
    this.isResizing = false;
    this.pendingAssistantAnimationTimestamp = null;
    this.shouldAutoScrollToBottom = false;
    this.activeTypingIndicatorLabel = '';
    this.backendStatus = 'connecting'; // connecting | ready | offline
    this.backendStatusTimer = null;
    this.isAssistantActionRunning = false;
    this.currentTheme = 'night';
    this.icon32Url = chrome.runtime.getURL('icons/nubra.png');
    this.icon48Url = chrome.runtime.getURL('icons/nubra.png');
    this.welcomeLogoUrl = chrome.runtime.getURL('icons/nubra.png');
    this.init();
  }

  init() {
    console.log('Initializing Nubra AI Assistant...');
    console.log('Document body:', document.body);
    this.loadThemePreference();
    this.loadAllSessions();
    this.createFloatingButton();
    this.createSidebar();
    // Setup event listeners AFTER sidebar is created and added to DOM
    this.setupEventListeners();
    this.setupStorageSync();
    this.setupJupyterSelectionCapture();
    this.startBackendStatusPolling();
    console.log('Nubra AI Assistant initialization complete');
  }

  async loadAllSessions() {
    try {
      const result = await chrome.storage.local.get(['nubraAllSessions', 'nubraActiveSessionId', 'nubraUiState']);
      this.allSessions = (result.nubraAllSessions || []).map((session) =>
        this.ensureSessionState({
          title: 'New Session',
          category: 'General Question',
          brokerHint: 'Generic',
          pinned: false,
          userPromptCount: 0,
          lastSummarizedUserCount: 0,
          lastSummarizedMessageIndex: 0,
          contextSummary: '',
          contextChunks: [],
          lastAssistantAction: null,
          ...session
        })
      );
      this.activeSessionId = result.nubraActiveSessionId || this.activeSessionId || null;
      if (result.nubraUiState && typeof result.nubraUiState === 'object') {
        const storedMode = result.nubraUiState.mode;
        const storedView = result.nubraUiState.view;
        this.currentMode = storedMode === 'chat' ? 'chat' : 'convert';
        this.currentView = storedView === 'history' ? 'history' : 'chat';
      }
      
      // Load latest session if present, otherwise create a new one.
      if (this.allSessions.length > 0) {
        this.loadCurrentSession();
      } else {
        this.createNewSession();
      }
      this.updateModeUI();
      this.updateChatHistoryUI();
    } catch (error) {
      console.log('Storage not available, using empty sessions');
      this.allSessions = [];
      this.createNewSession();
      this.updateModeUI();
      this.updateChatHistoryUI();
    }
  }

  async saveUiState() {
    try {
      await chrome.storage.local.set({
        nubraUiState: {
          view: this.currentView === 'history' ? 'history' : 'chat',
          mode: this.currentMode === 'chat' ? 'chat' : 'convert'
        }
      });
    } catch (error) {
      console.log('Could not save UI state:', error);
    }
  }

  async saveAllSessions() {
    try {
      await chrome.storage.local.set({
        nubraAllSessions: this.allSessions,
        nubraActiveSessionId: this.activeSessionId || (this.currentSession && this.currentSession.id) || null
      });
    } catch (error) {
      console.log('Could not save to storage:', error);
    }
  }

  createNewSession() {
    this.currentSession = {
      id: Date.now().toString(),
      name: `Session ${new Date().toLocaleString()}`,
      title: 'New Session',
      category: 'General Question',
      brokerHint: 'Generic',
      pinned: false,
      userPromptCount: 0,
      lastSummarizedUserCount: 0,
      lastSummarizedMessageIndex: 0,
      contextSummary: '',
      contextChunks: [],
      lastAssistantAction: null,
      messages: [],
      createdAt: new Date().toISOString()
    };
    this.activeSessionId = this.currentSession.id;
    this.allSessions.unshift(this.currentSession);
    this.saveAllSessions();
  }

  ensureSessionState(session) {
    if (!session) return session;
    const inferredUserPrompts = Array.isArray(session.messages)
      ? session.messages.filter((m) => m && m.role === 'user').length
      : 0;
    session.userPromptCount = Number(session.userPromptCount || inferredUserPrompts || 0);
    session.lastSummarizedUserCount = Number(session.lastSummarizedUserCount || 0);
    session.lastSummarizedMessageIndex = Number(session.lastSummarizedMessageIndex || 0);
    session.contextSummary = typeof session.contextSummary === 'string' ? session.contextSummary : '';
    session.contextChunks = Array.isArray(session.contextChunks) ? session.contextChunks : [];
    session.lastAssistantAction =
      session.lastAssistantAction && typeof session.lastAssistantAction === 'object'
        ? session.lastAssistantAction
        : null;
    return session;
  }

  loadCurrentSession() {
    if (this.allSessions.length > 0) {
      const activeSession = this.activeSessionId
        ? this.allSessions.find((session) => session.id === this.activeSessionId)
        : null;
      this.currentSession = this.ensureSessionState(activeSession || this.allSessions[0]); // Load active session or fallback
      this.activeSessionId = this.currentSession ? this.currentSession.id : this.activeSessionId;
    }
  }

  createFloatingButton() {
    console.log('Creating floating button...');
    
    const addButton = () => {
      if (!document.getElementById('nubra-floating-button')) {
        const button = document.createElement('div');
        button.id = 'nubra-floating-button';
        button.innerHTML = `
          <div class="nubra-button-icon">
            <img src="${this.welcomeLogoUrl}" alt="Nubra AI" width="26" height="26">
          </div>
        `;
        
        button.addEventListener('click', () => this.toggleSidebar());
        document.body.appendChild(button);
        console.log('Floating button added to DOM:', button);
      }
    };
    
    if (document.body) {
      addButton();
    } else {
      document.addEventListener('DOMContentLoaded', addButton);
    }
  }

  createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'nubra-sidebar';
    sidebar.innerHTML = `
      <div class="nubra-resize-handle" id="nubra-resize-handle" title="Drag to resize"></div>
      <div class="nubra-sidebar-header">
        <div class="nubra-header-row">
          <img src="${this.icon32Url}" alt="Nubra AI" class="nubra-header-icon" id="nubra-header-home">
          <div class="nubra-header-title" id="nubra-header-home-title">
            <span class="nubra-brand-primary">Nubra</span>
            <span class="nubra-brand-secondary">AI Assistant</span>
          </div>
          <div class="nubra-mode-switch">
            <button class="nubra-mode-btn" id="nubra-mode-chat-btn">Chat</button>
            <button class="nubra-mode-btn active" id="nubra-mode-convert-btn">Code Convert</button>
          </div>
          <div class="nubra-header-actions">
            <button class="nubra-icon-action nubra-history-btn" id="nubra-history-btn" aria-label="History">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="nubra-action-label">History</span>
            </button>
            <button class="nubra-icon-action nubra-new-session-btn" id="nubra-new-session-btn" aria-label="New Session">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16m8-8H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="nubra-action-label">New Session</span>
            </button>
            <button class="nubra-icon-action nubra-theme-btn" id="nubra-theme-btn" aria-label="Night Mode">
              <svg class="nubra-theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg class="nubra-theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" style="display:none;">
                <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="nubra-action-label" id="nubra-theme-label">Night Mode</span>
            </button>
            <button class="nubra-icon-action nubra-close-btn" id="nubra-close-btn" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="nubra-action-label">Close</span>
            </button>
          </div>
        </div>
      </div>

      <div class="nubra-chat-container">
        <div class="nubra-chat-history" id="nubra-chat-history"></div>
        
        <div class="nubra-input-area">
          <div class="nubra-input-shell">
            <div class="nubra-input-row">
              <textarea 
                id="nubra-code-input" 
                placeholder="Ask anything about Nubra SDK..."
                rows="1"
              ></textarea>
              <div class="nubra-inline-actions">
                <button class="nubra-clear-btn" id="nubra-clear-btn" title="Clear input">
                  <svg class="nubra-clear-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span class="nubra-clear-label">Clear</span>
                </button>
                <button class="nubra-send-btn" id="nubra-send-btn" title="Send">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 17V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M8 11L12 7L16 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="nubra-input-meta">
            <div class="nubra-input-meta-row">
              <span>Ctrl/Cmd + Enter to send</span>
              <span class="nubra-backend-status-chip connecting" id="nubra-backend-status-chip">Connecting</span>
            </div>
            <div class="nubra-backend-status-help" id="nubra-backend-status-help" style="display:none;">
              Backend not reachable. Retry or check service.
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(sidebar);
    this.applySidebarWidth();
    
    // Inject CSS if not already loaded
    if (!document.querySelector('#nubra-extension-styles')) {
      const style = document.createElement('style');
      style.id = 'nubra-extension-styles';
      style.textContent = `
        #nubra-floating-button {
          position: fixed !important;
          bottom: 8px !important;
          right: 8px !important;
          width: auto !important;
          height: auto !important;
          background: transparent !important;
          border: none !important;
          cursor: pointer !important;
          z-index: 10000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: none !important;
          transition: all 0.3s ease !important;
          animation: none !important;
        }
      `;
      document.head.appendChild(style);
    }
    
    this.showWelcomeMessage();
    this.updateModeUI();
    this.applyTheme();
  }

  applySidebarWidth() {
    const sidebar = document.getElementById('nubra-sidebar');
    if (!sidebar) return;

    const viewportMax = Math.max(320, window.innerWidth - 24);
    const maxAllowed = Math.min(this.maxSidebarWidth, viewportMax);
    this.sidebarWidth = Math.max(this.minSidebarWidth, Math.min(this.sidebarWidth, maxAllowed));

    sidebar.style.width = `${this.sidebarWidth}px`;
    sidebar.style.right = this.isOpen ? '0px' : `-${this.sidebarWidth}px`;
    sidebar.classList.toggle('nubra-sidebar-collapsed', this.sidebarWidth <= this.minSidebarWidth + 6);
    sidebar.classList.toggle('nubra-sidebar-tight', this.sidebarWidth < 320);
  }

  showWelcomeMessage() {
    if (this.currentSession && this.currentSession.messages.length > 0) {
      this.updateChatHistoryUI();
      return;
    }

    const welcomeMessage = `
      <div class="nubra-welcome-message">
        <div class="nubra-welcome-brand">
          <div class="nubra-welcome-icon">
            <img src="${this.welcomeLogoUrl}" alt="Nubra AI" width="42" height="42">
          </div>
          <h3>Nubra AI Assistant</h3>
        </div>
        <p>Build, convert, and integrate trading logic with confidence.</p>
        <p>Converts code from any broker to Nubra SDK.</p>
        <p>Paste any strategy or order logic to start.</p>
        <p>Choose a mode from the top bar to begin:</p>
        <ul>
          <li><strong>Code Convert</strong> - Transform broker strategy code into Nubra SDK</li>
          <li><strong>Chat</strong> - Ask questions about Nubra SDK APIs, workflows, and integration</li>
        </ul>
      </div>
    `;

      const chatHistory = document.getElementById('nubra-chat-history');
      if (chatHistory) {
        chatHistory.innerHTML = welcomeMessage;
      }
  }

  startNewSession() {
    // Save current session to history before creating new one
    if (this.currentSession && this.currentSession.messages.length > 0) {
      this.currentSession.updatedAt = new Date().toISOString();
      this.saveAllSessions();
    }
    
    this.createNewSession();
    this.currentView = 'chat';
    this.saveUiState();
    this.showWelcomeMessage();
    this.showMessage('New session started! Previous session saved.', 'success');
  }

  showHistory() {
    if (this.allSessions.length === 0) {
      this.showMessage('No history yet. Start converting some code!', 'info');
      return;
    }
    
    // Show all sessions
    this.currentView = 'history';
    this.editingSessionId = null;
    this.saveUiState();
    this.showAllSessions();
    this.showMessage('Showing all sessions', 'info');
  }

  toggleSidebar() {
    console.log('toggleSidebar called');
    this.isOpen = !this.isOpen;
    const sidebar = document.getElementById('nubra-sidebar');
    const button = document.getElementById('nubra-floating-button');
    
    console.log('Sidebar element:', sidebar);
    console.log('Button element:', button);
    console.log('Is open:', this.isOpen);
    console.log('Sidebar classes:', sidebar ? sidebar.className : 'not found');
    console.log('Button classes:', button ? button.className : 'not found');
    
    if (sidebar && button) {
      if (this.isOpen) {
        this.loadAllSessions();
        this.sidebarWidth = this.defaultSidebarWidth;
        sidebar.classList.add('open');
        sidebar.style.right = '0px';
        button.classList.add('active');
        console.log('Sidebar opened - added classes');
        console.log('Sidebar classes after:', sidebar.className);
        console.log('Button classes after:', button.className);
      } else {
        sidebar.classList.remove('open');
        sidebar.style.right = `-${this.sidebarWidth}px`;
        button.classList.remove('active');
        console.log('Sidebar closed - removed classes');
        console.log('Sidebar classes after:', sidebar.className);
        console.log('Button classes after:', button.className);
      }
      this.applySidebarWidth();
    } else {
      console.error('Sidebar or button not found!');
      console.error('Sidebar exists:', !!sidebar);
      console.error('Button exists:', !!button);
    }
  }

  openSidebarDefault() {
    if (!this.isOpen) {
      this.isOpen = true;
    }
    this.sidebarWidth = this.defaultSidebarWidth;
    const sidebar = document.getElementById('nubra-sidebar');
    const button = document.getElementById('nubra-floating-button');
    if (sidebar) {
      sidebar.classList.add('open');
    }
    if (button) {
      button.classList.add('active');
    }
    this.applySidebarWidth();
    this.refreshBackendStatusUI();
  }

  setMode(mode) {
    this.currentMode = mode === 'convert' ? 'convert' : 'chat';
    if (this.currentView === 'history') {
      this.currentView = 'chat';
      this.editingSessionId = null;
    }
    this.updateModeUI();
    this.saveUiState();
    this.updateChatHistoryUI();
  }

  goToChatSection() {
    this.setMode('chat');
    this.currentView = 'chat';
    this.saveUiState();
    this.updateChatHistoryUI();
  }

  updateModeUI() {
    const chatBtn = document.getElementById('nubra-mode-chat-btn');
    const convertBtn = document.getElementById('nubra-mode-convert-btn');
    const sendBtn = document.getElementById('nubra-send-btn');
    const input = document.getElementById('nubra-code-input');

    if (chatBtn) chatBtn.classList.toggle('active', this.currentMode === 'chat');
    if (convertBtn) convertBtn.classList.toggle('active', this.currentMode === 'convert');
    if (sendBtn) sendBtn.style.display = 'inline-flex';
    if (input) {
      input.placeholder =
        this.currentMode === 'convert'
          ? 'Paste your code here...'
          : 'Ask anything about Nubra SDK...';
      this.adjustInputHeight();
    }
    this.updateInputControls();
  }

  setBackendStatus(status) {
    const normalized = status === 'ready' || status === 'offline' ? status : 'connecting';
    this.backendStatus = normalized;
    this.refreshBackendStatusUI();
  }

  refreshBackendStatusUI() {
    const chip = document.getElementById('nubra-backend-status-chip');
    const help = document.getElementById('nubra-backend-status-help');
    if (!chip || !help) return;

    chip.classList.remove('ready', 'connecting', 'offline');
    chip.classList.add(this.backendStatus);

    if (this.backendStatus === 'ready') {
      chip.textContent = 'Ready';
      help.style.display = 'none';
    } else if (this.backendStatus === 'offline') {
      chip.textContent = 'Offline';
      help.style.display = 'block';
    } else {
      chip.textContent = 'Connecting';
      help.style.display = 'none';
    }
  }

  async checkBackendStatus() {
    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'checkBackendHealth' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response from background worker.' });
        });
      });
      this.setBackendStatus(result && result.ok ? 'ready' : 'offline');
    } catch (error) {
      this.setBackendStatus('offline');
    }
  }

  startBackendStatusPolling() {
    this.checkBackendStatus();
    if (this.backendStatusTimer) {
      clearInterval(this.backendStatusTimer);
    }
    this.backendStatusTimer = setInterval(() => {
      this.checkBackendStatus();
    }, 25000);
  }

  setLastAssistantAction(actionData) {
    if (!this.currentSession) return;
    this.currentSession.lastAssistantAction =
      actionData && typeof actionData === 'object' ? actionData : null;
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveAllSessions();
  }

  getLastAssistantAction() {
    if (!this.currentSession) return null;
    const data = this.currentSession.lastAssistantAction;
    if (!data || typeof data !== 'object') return null;
    return data;
  }

  renderRegenerateButton() {
    return `
      <button class="nubra-regenerate-btn" data-action="assistant-action-regenerate" type="button" title="Regenerate response" aria-label="Regenerate response">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.93 4.93A10 10 0 1012 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 7h5V2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
  }

  async handleAssistantRegenerate() {
    const lastAction = this.getLastAssistantAction();
    if (!lastAction) {
      this.showMessage('No recent assistant response available.', 'info');
      return;
    }
    if (this.isAssistantActionRunning) {
      this.showMessage('Please wait for current action to finish.', 'info');
      return;
    }

    this.isAssistantActionRunning = true;
    this.updateChatHistoryUI();
    const typingId = this.showTypingIndicator('Regenerating response...');

    try {
      if (lastAction.mode === 'convert') {
        const sourceCode = String(lastAction.userInput || '');
        const prompt = [
          'Regenerate an alternative Nubra SDK conversion for the same source code.',
          'Keep trading logic identical, but present a different clean structure.',
          '',
          'SOURCE CODE START',
          sourceCode,
          'SOURCE CODE END'
        ].join('\n');

        const regenResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'chatQuery', payload: { action: 'chat', prompt } }, (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(response || { ok: false, error: 'No response from background worker.' });
          });
        });

        if (regenResult.ok && regenResult.data && regenResult.data.answer) {
          const out = String(regenResult.data.answer || '');
          this.addMessage('assistant', out, 'converted_output');
          this.setLastAssistantAction({
            mode: 'convert',
            requestPayload: { ...(lastAction.requestPayload || {}) },
            userInput: sourceCode,
            responseText: out
          });
        } else {
          this.addMessage(
            'assistant',
            `Error: ${regenResult.error || 'Unable to regenerate right now.'}`,
            'error'
          );
        }
      } else {
        const userInput = String(lastAction.userInput || '');
        const sessionId = this.currentSession && this.currentSession.id
          ? String(this.currentSession.id)
          : (this.activeSessionId ? String(this.activeSessionId) : undefined);

        const prompt = `${userInput}\n\nPlease provide an alternative version with a different structure while keeping correctness.`;

        const chatResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: 'chatQuery', payload: { action: 'chat', session_id: sessionId, prompt } },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
              }
              resolve(response || { ok: false, error: 'No response from background worker.' });
            }
          );
        });

        if (chatResult.ok && chatResult.data && chatResult.data.answer) {
          const out = String(chatResult.data.answer || '');
          const assistantType = /(warning|mandatory|must update|constraint|risk)/i.test(out)
            ? 'warning'
            : out.length > 700
              ? 'explanation'
              : 'normal';
          this.addMessage('assistant', out, assistantType);
          this.setLastAssistantAction({
            mode: 'chat',
            requestPayload: { action: 'chat', session_id: sessionId, prompt: userInput },
            userInput,
            responseText: out
          });
        } else {
          this.addMessage('assistant', `Error: ${chatResult.error || 'Unable to process this action right now.'}`, 'error');
        }
      }
    } catch (error) {
      this.addMessage('assistant', `Network error: ${error.message}`, 'error');
    } finally {
      this.removeTypingIndicator(typingId);
      this.isAssistantActionRunning = false;
      this.updateChatHistoryUI();
    }
  }

  detectInputContext(text) {
    const value = (text || '').trim();
    if (!value) {
      return { type: 'general_question', label: 'General Question', broker: '' };
    }

    const lower = value.toLowerCase();
    const brokerMap = [
      { key: 'zerodha', alias: 'Zerodha Kite' },
      { key: 'kite', alias: 'Zerodha Kite' },
      { key: 'binance', alias: 'Binance' },
      { key: 'ibkr', alias: 'IBKR' },
      { key: 'upstox', alias: 'Upstox' },
      { key: 'fyers', alias: 'Fyers' }
    ];
    const broker = (brokerMap.find((b) => lower.includes(b.key)) || {}).alias || '';

    const hasError =
      /(traceback|exception|error:|stack trace|failed|syntaxerror|typeerror|referenceerror)/i.test(value);
    const hasOrder =
      /(place_?order|create_?order|buy|sell|order_type|product_type|trigger_price|stop.?loss|sl)/i.test(value);
    const hasStrategy =
      /(strategy|entry|exit|indicator|rsi|ema|sma|macd|backtest|signal|candl)/i.test(value);
    const looksCode = /[{}();=]|def\s+\w+|function\s+\w+|class\s+\w+|import\s+\w+/.test(value);

    if (hasError) return { type: 'error_debug', label: 'Error Log', broker };
    if (hasOrder) return { type: 'order_placement', label: `Order Placement${broker ? ` (${broker})` : ''}`, broker };
    if (hasStrategy || looksCode) return { type: 'strategy_logic', label: 'Strategy Logic', broker };
    return { type: 'general_question', label: 'General Question', broker };
  }

  updateSessionMetadataFromInput(text) {
    if (!this.currentSession) return;
    const ctx = this.detectInputContext(text);
    const tickerMatch = (text || '').match(/\b([A-Z]{2,10})\b/);
    const ticker = tickerMatch ? tickerMatch[1] : '';
    const broker = ctx.broker || 'Generic';
    const category =
      ctx.type === 'order_placement'
        ? 'Order Placement'
        : ctx.type === 'strategy_logic'
          ? 'Strategy Conversion'
          : ctx.type === 'error_debug'
            ? 'Order Debug'
            : 'General Question';

    const title = ticker
      ? `${ticker} - ${category}`
      : `${category} - ${broker}`;

    this.currentSession.title = title;
    this.currentSession.category = category;
    this.currentSession.brokerHint = broker;
    this.currentSession.name = title;
  }

  buildContextualChatPrompt(userPrompt) {
    const session = this.currentSession || {};
    const summary = (session.contextSummary || '').trim();
    const recent = (session.messages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').trim().slice(0, 360)}`)
      .join('\n');

    const promptCount = Number(session.userPromptCount || 0);

    return [
      'SESSION PREPROMPT (FOR CONTEXT ONLY):',
      `Prompt count in this session: ${promptCount}`,
      summary
        ? `Summary so far:\n${summary}`
        : 'Summary so far:\n- Session started. No summary yet.',
      recent ? `Recent exchange snapshot:\n${recent}` : 'Recent exchange snapshot:\n- No recent messages.',
      '',
      'Now answer the user query using this context without repeating full history.',
      'USER QUERY START',
      userPrompt,
      'USER QUERY END'
    ].join('\n');
  }

  async maybeSummarizeSessionContext() {
    if (!this.currentSession) return;

    const totalPrompts = Number(this.currentSession.userPromptCount || 0);
    const lastSummarized = Number(this.currentSession.lastSummarizedUserCount || 0);

    if (totalPrompts < 15 || totalPrompts - lastSummarized < 15) return;

    const startIdx = Number(this.currentSession.lastSummarizedMessageIndex || 0);
    const sourceMessages = (this.currentSession.messages || []).slice(startIdx);
    if (sourceMessages.length === 0) return;

    const compactTranscript = sourceMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').trim().slice(0, 700)}`)
      .join('\n');

    const summarizationPrompt = [
      'Summarize the following conversation chunk as persistent context for future replies.',
      'Use short numbered steps.',
      'Include:',
      '1) what user asked,',
      '2) what was answered,',
      '3) corrections/changes made,',
      '4) unresolved items.',
      'Keep it compact and factual.',
      '',
      'CONVERSATION CHUNK START',
      compactTranscript,
      'CONVERSATION CHUNK END'
    ].join('\n');

    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'chatQuery', payload: { prompt: summarizationPrompt } }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response from background worker.' });
        });
      });

      if (result.ok && result.data && result.data.answer) {
        const chunkText = String(result.data.answer || '').trim();
        const fromPrompt = lastSummarized + 1;
        const toPrompt = totalPrompts;
        const chunkTitle = `Session context (${fromPrompt}-${toPrompt})`;
        const chunkRecord = {
          title: chunkTitle,
          text: chunkText,
          createdAt: new Date().toISOString()
        };

        const existingChunks = Array.isArray(this.currentSession.contextChunks) ? this.currentSession.contextChunks : [];
        const nextChunks = [...existingChunks, chunkRecord].slice(-4);

        this.currentSession.contextChunks = nextChunks;
        this.currentSession.contextSummary = nextChunks.map((c) => `${c.title}\n${c.text}`).join('\n\n');
        this.currentSession.lastSummarizedUserCount = totalPrompts;
        this.currentSession.lastSummarizedMessageIndex = this.currentSession.messages.length;
        this.currentSession.updatedAt = new Date().toISOString();
        this.saveAllSessions();

        this.showMessage('Session context updated from last 15 prompts.', 'info');
      }
    } catch (error) {
      console.log('Context summarization failed:', error);
    }
  }

  setupEventListeners() {
    console.log('Setting up event listeners...');

    const closeBtn = document.getElementById('nubra-close-btn');
    const headerHome = document.getElementById('nubra-header-home');
    const headerHomeTitle = document.getElementById('nubra-header-home-title');
    const modeChatBtn = document.getElementById('nubra-mode-chat-btn');
    const modeConvertBtn = document.getElementById('nubra-mode-convert-btn');
    const sendBtn = document.getElementById('nubra-send-btn');
    const clearBtn = document.getElementById('nubra-clear-btn');
    const historyBtn = document.getElementById('nubra-history-btn');
    const newSessionBtn = document.getElementById('nubra-new-session-btn');
    const themeBtn = document.getElementById('nubra-theme-btn');
    const sidebar = document.getElementById('nubra-sidebar');
    const resizeHandle = document.getElementById('nubra-resize-handle');
    
    console.log('Elements found:', {
      closeBtn: !!closeBtn,
      headerHome: !!headerHome,
      headerHomeTitle: !!headerHomeTitle,
      modeChatBtn: !!modeChatBtn,
      modeConvertBtn: !!modeConvertBtn,
      sendBtn: !!sendBtn,
      clearBtn: !!clearBtn,
      historyBtn: !!historyBtn,
      newSessionBtn: !!newSessionBtn,
      themeBtn: !!themeBtn,
      sidebar: !!sidebar
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.toggleSidebar();
      });
    }

    if (headerHome) {
      headerHome.addEventListener('click', () => {
        this.goToChatSection();
      });
    }

    if (headerHomeTitle) {
      headerHomeTitle.addEventListener('click', () => {
        this.goToChatSection();
      });
    }

    if (modeChatBtn) {
      modeChatBtn.addEventListener('click', () => {
        this.setMode('chat');
      });
    }

    if (modeConvertBtn) {
      modeConvertBtn.addEventListener('click', () => {
        this.setMode('convert');
      });
    }

    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        this.showHistory();
      });
    }

    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', () => {
        this.startNewSession();
      });
    }

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (sendBtn.disabled) return;
        this.handleSubmit();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const input = document.getElementById('nubra-code-input');
        if (input) {
          input.value = '';
          this.adjustInputHeight();
          this.updateInputControls();
          input.focus();
        }
      });
    }

    const codeInput = document.getElementById('nubra-code-input');
    const inputShell = document.querySelector('.nubra-input-shell');
    if (codeInput) {
      this.adjustInputHeight();
      this.updateInputControls();

      codeInput.addEventListener('input', () => {
        this.adjustInputHeight();
        this.updateInputControls();
      });

      codeInput.addEventListener('paste', () => {
        requestAnimationFrame(() => {
          this.adjustInputHeight();
          this.updateInputControls();
        });
      });

      codeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.handleSubmit();
        }
      });
    }

    if (inputShell && codeInput) {
      inputShell.addEventListener('click', (event) => {
        if (event.target !== codeInput) {
          codeInput.focus();
        }
      });
    }
    if (sidebar) {
      let collapsedTapStart = null;

      sidebar.addEventListener('input', (event) => {
        const target = event.target;
        if (!target) return;

        if (target.id === 'nubra-session-search-input') {
          this.sessionSearchQuery = String(target.value || '').trim().toLowerCase();
          if (this.currentView === 'history') {
            this.showAllSessions();
          }
        }
      });

      sidebar.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!target || target.id !== 'nubra-edit-session-input') return;
        if (event.key === 'Enter') {
          event.preventDefault();
          this.commitSessionRename(target.dataset.sessionId, target.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelSessionRename();
        }
      });

      sidebar.addEventListener('pointerdown', (event) => {
        if (!sidebar.classList.contains('nubra-sidebar-collapsed')) return;
        if (event.button !== 0) return;
        collapsedTapStart = { x: event.clientX, y: event.clientY, t: Date.now() };
      });

      sidebar.addEventListener('pointerup', (event) => {
        if (!sidebar.classList.contains('nubra-sidebar-collapsed')) return;
        if (!collapsedTapStart || event.button !== 0) return;

        const dx = Math.abs(event.clientX - collapsedTapStart.x);
        const dy = Math.abs(event.clientY - collapsedTapStart.y);
        const dt = Date.now() - collapsedTapStart.t;
        collapsedTapStart = null;

        // Reopen only on intentional short tap/click, not on scroll/drag.
        if (dx <= 5 && dy <= 5 && dt <= 600) {
          this.sidebarWidth = this.defaultSidebarWidth;
          this.applySidebarWidth();
        }
      });

      sidebar.addEventListener('click', (event) => {
        if (sidebar.classList.contains('nubra-sidebar-collapsed')) {
          return;
        }

        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;

        const { action } = actionElement.dataset;
        if (action === 'load-session') {
          this.loadSession(actionElement.dataset.sessionId);
        } else if (action === 'pin-session') {
          this.togglePinSession(actionElement.dataset.sessionId);
        } else if (action === 'start-rename-session') {
          this.startSessionRename(actionElement.dataset.sessionId);
        } else if (action === 'save-rename-session') {
          const sessionId = actionElement.dataset.sessionId;
          const input = document.getElementById('nubra-edit-session-input');
          this.commitSessionRename(sessionId, input ? input.value : '');
        } else if (action === 'cancel-rename-session') {
          this.cancelSessionRename();
        } else if (action === 'delete-session') {
          this.deleteSession(actionElement.dataset.sessionId);
        } else if (action === 'back-current') {
          this.goToChatSection();
        } else if (action === 'copy-code') {
          this.copyCode(actionElement.dataset.codeId);
        } else if (action === 'download-code') {
          this.downloadCode(
            actionElement.dataset.codeId,
            actionElement.dataset.language || '',
            actionElement.dataset.strategy || ''
          );
        } else if (action === 'assistant-action-regenerate') {
          this.handleAssistantRegenerate();
        }
      });
    }

    if (resizeHandle && sidebar) {
      const endResize = () => {
        if (!this.isResizing) return;
        this.isResizing = false;
        sidebar.classList.remove('nubra-no-transition', 'nubra-resizing');
        document.body.classList.remove('nubra-resizing');
      };

      resizeHandle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.isResizing = true;
        sidebar.classList.add('nubra-no-transition', 'nubra-resizing');
        document.body.classList.add('nubra-resizing');
        resizeHandle.setPointerCapture(event.pointerId);
      });

      resizeHandle.addEventListener('pointermove', (event) => {
        if (!this.isResizing) return;
        if ((event.buttons & 1) !== 1) {
          endResize();
          return;
        }

        const newWidth = window.innerWidth - event.clientX;
        this.sidebarWidth = newWidth;
        this.applySidebarWidth();
      });

      resizeHandle.addEventListener('pointerup', () => {
        endResize();
      });

      resizeHandle.addEventListener('pointercancel', () => {
        endResize();
      });

      window.addEventListener('blur', () => {
        endResize();
      });
    }

    window.addEventListener('resize', () => {
      this.applySidebarWidth();
    });
  }

  setupJupyterSelectionCapture() {
    const isJupyterLab =
      /(^|\.)jupyter\.org$/i.test(window.location.hostname) &&
      window.location.pathname.includes('/try-jupyter/lab');
    if (!isJupyterLab) return;

    let hideTimer = null;
    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const hideCapture = () => {
      const existing = document.getElementById('nubra-selection-capture');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    };

    const getSelectedText = () => {
      const winSel = window.getSelection ? (window.getSelection().toString() || '').trim() : '';
      if (winSel) return winSel;

      const active = document.activeElement;
      if (active) {
        const isInput = active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && typeof active.value === 'string');
        if (isInput && typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
          const selected = (active.value || '').slice(active.selectionStart, active.selectionEnd).trim();
          if (selected) return selected;
        }
      }

      const cmEditor =
        document.querySelector('.cm-editor.cm-focused') ||
        (active && active.closest ? active.closest('.cm-editor') : null) ||
        document.querySelector('.cm-editor');
      if (!cmEditor) return '';
      const view = (cmEditor.cmView && cmEditor.cmView.view) || cmEditor.view || null;
      if (!view || !view.state || !view.state.doc || !view.state.selection || !Array.isArray(view.state.selection.ranges)) {
        return '';
      }
      const ranges = view.state.selection.ranges.filter((r) => r && r.from !== r.to);
      if (!ranges.length) return '';
      return ranges.map((r) => view.state.doc.sliceString(r.from, r.to)).join('\n').trim();
    };

    const getAnchorRect = () => {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect && rect.width >= 0 && rect.height >= 0) return rect;
      }
      const active = document.activeElement;
      if (active && typeof active.getBoundingClientRect === 'function') {
        return active.getBoundingClientRect();
      }
      return null;
    };

    const showCapture = (text) => {
      let pop = document.getElementById('nubra-selection-capture');
      if (!pop) {
        pop = document.createElement('button');
        pop.id = 'nubra-selection-capture';
        pop.type = 'button';
        pop.textContent = 'Convert with Nubra AI';
        pop.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openSidebarDefault();
          this.setMode('convert');
          const input = document.getElementById('nubra-code-input');
          if (input) {
            input.value = text;
            this.adjustInputHeight();
            this.updateInputControls();
            input.focus();
          }
          this.showMessage('Code captured from webpage', 'info');
          hideCapture();
        });
        document.body.appendChild(pop);
      }

      pop.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openSidebarDefault();
        this.setMode('convert');
        const input = document.getElementById('nubra-code-input');
        if (input) {
          input.value = text;
          this.adjustInputHeight();
          this.updateInputControls();
          input.focus();
        }
        this.showMessage('Code captured from webpage', 'info');
        hideCapture();
      };

      const rect = getAnchorRect();
      const top = rect ? window.scrollY + rect.bottom + 8 : window.scrollY + 80;
      const left = rect ? window.scrollX + rect.left : window.scrollX + 80;
      pop.style.top = `${Math.max(8, top)}px`;
      pop.style.left = `${Math.max(8, left)}px`;
      pop.style.display = 'inline-flex';

      clearHideTimer();
      hideTimer = setTimeout(() => {
        hideCapture();
      }, 2800);
    };

    const maybeShowCapture = () => {
      const text = getSelectedText();
      if (text) {
        showCapture(text);
      } else {
        hideCapture();
      }
    };

    document.addEventListener('mouseup', () => setTimeout(maybeShowCapture, 40), true);
    document.addEventListener('keyup', () => setTimeout(maybeShowCapture, 40), true);
    document.addEventListener('scroll', () => hideCapture(), true);
    document.addEventListener('click', (event) => {
      const pop = document.getElementById('nubra-selection-capture');
      if (pop && !pop.contains(event.target)) {
        const text = getSelectedText();
        if (!text) hideCapture();
      }
    }, true);
  }

  async loadThemePreference() {
    try {
      const result = await chrome.storage.local.get(['nubraTheme']);
      const savedTheme = result.nubraTheme;
      if (savedTheme === 'night') {
        this.currentTheme = savedTheme;
      } else {
        this.currentTheme = 'night';
      }
    } catch (error) {
      const fallbackTheme = window.localStorage.getItem('nubraTheme');
      if (fallbackTheme === 'night') {
        this.currentTheme = fallbackTheme;
      } else {
        this.currentTheme = 'night';
      }
    }
    this.applyTheme();
  }

  async saveThemePreference() {
    try {
      await chrome.storage.local.set({ nubraTheme: this.currentTheme });
    } catch (error) {
      console.log('Could not save theme to chrome storage:', error);
    }
    try {
      window.localStorage.setItem('nubraTheme', this.currentTheme);
    } catch (error) {
      console.log('Could not save theme to local storage:', error);
    }
  }

  setupStorageSync() {
    if (window.__nubraStorageSyncAdded) return;
    window.__nubraStorageSyncAdded = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const sessionsChanged = !!changes.nubraAllSessions;
      const activeChanged = !!changes.nubraActiveSessionId;
      const uiStateChanged = !!changes.nubraUiState;
      if (!sessionsChanged && !activeChanged && !uiStateChanged) return;

      const allSessions = sessionsChanged ? (changes.nubraAllSessions.newValue || []) : this.allSessions;
      this.allSessions = allSessions.map((session) => this.ensureSessionState(session));

      if (activeChanged) {
        this.activeSessionId = changes.nubraActiveSessionId.newValue || null;
      }
      if (uiStateChanged) {
        const nextUiState = changes.nubraUiState.newValue || {};
        this.currentMode = nextUiState.mode === 'chat' ? 'chat' : 'convert';
        this.currentView = nextUiState.view === 'history' ? 'history' : 'chat';
      }

      this.loadCurrentSession();
      this.updateModeUI();
      if (this.isOpen) {
        this.updateChatHistoryUI();
      }
    });
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'night' ? 'glass' : 'night';
    this.applyTheme();
    this.saveThemePreference();
  }

  applyTheme() {
    const sidebar = document.getElementById('nubra-sidebar');
    const themeBtn = document.getElementById('nubra-theme-btn');
    const themeLabel = document.getElementById('nubra-theme-label');
    if (!sidebar) return;

    const isNight = this.currentTheme === 'night';
    sidebar.classList.toggle('nubra-theme-night', isNight);

    if (themeBtn) {
      themeBtn.classList.toggle('active', isNight);
      themeBtn.title = isNight ? 'Glassy Blue Mode' : 'Night Mode';
    }
    if (themeLabel) {
      themeLabel.textContent = isNight ? 'Blue Mode' : 'Night Mode';
    }

    const moonIcon = themeBtn ? themeBtn.querySelector('.nubra-theme-icon-moon') : null;
    const sunIcon = themeBtn ? themeBtn.querySelector('.nubra-theme-icon-sun') : null;
    if (moonIcon && sunIcon) {
      moonIcon.style.display = isNight ? 'none' : 'inline-block';
      sunIcon.style.display = isNight ? 'inline-block' : 'none';
    }
  }

  async handleConvert() {
    const codeInput = document.getElementById('nubra-code-input');
    const code = codeInput.value.trim();
    
    if (!code) {
      this.showMessage('Please paste some code to convert.', 'error');
      return;
    }

    const sendBtn = document.getElementById('nubra-send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<div class="nubra-spinner"></div>';
    }

    codeInput.value = '';
    this.adjustInputHeight();
    this.updateInputControls();

    // Add user message to chat
    this.addMessage('user', code, 'user_code');

    const typingId = this.showTypingIndicator('Converting code...');

    try {
      const payload = {
        broker: 'OTHER',
        language: 'other',
        code: code,
        options: {
          strictSemantics: true,
          addRiskChecks: true,
          explainChanges: true
        }
      };

      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'convertCode', payload }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response from background worker.' });
        });
      });

      if (result.ok && result.data && result.data.convertedCode) {
        // Add AI response to chat
        this.addMessage('assistant', result.data.convertedCode, 'converted_output');
        this.setLastAssistantAction({
          mode: 'convert',
          requestPayload: payload,
          userInput: code,
          responseText: String(result.data.convertedCode || '')
        });
      } else {
        this.addMessage(
          'assistant',
          `Error: ${result.error || 'Conversion failed. Ensure backend is reachable and configured.'}`,
          'error'
        );
      }
    } catch (error) {
      this.addMessage('assistant', `Network error: ${error.message}`, 'error');
    } finally {
      this.removeTypingIndicator(typingId);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 17V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 11L12 7L16 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
      }
      this.updateInputControls();
    }
  }

  async handleChat() {
    const codeInput = document.getElementById('nubra-code-input');
    const prompt = codeInput.value.trim();

    if (!prompt) {
      this.showMessage('Please enter a question.', 'error');
      return;
    }

    const sendBtn = document.getElementById('nubra-send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<div class="nubra-spinner"></div>';
    }

    codeInput.value = '';
    this.adjustInputHeight();
    this.updateInputControls();

    this.addMessage('user', prompt, 'user_text');
    this.currentSession.userPromptCount = Number(this.currentSession.userPromptCount || 0) + 1;
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveAllSessions();

    if (this.currentSession.userPromptCount === 15) {
      this.showMessage('15 prompts reached. Session memory is now compacted automatically.', 'info');
    }

    const typingId = this.showTypingIndicator('Nubra AI is thinking...');

    try {
      const chatPayload = {
        action: 'chat',
        session_id: this.currentSession && this.currentSession.id
          ? String(this.currentSession.id)
          : (this.activeSessionId ? String(this.activeSessionId) : undefined),
        prompt
      };
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'chatQuery', payload: chatPayload }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response from background worker.' });
        });
      });

      if (result.ok && result.data && result.data.answer) {
        const answerText = result.data.answer || '';
        const assistantType = /(warning|mandatory|must update|constraint|risk)/i.test(answerText)
          ? 'warning'
          : answerText.length > 700
            ? 'explanation'
            : 'normal';
        this.addMessage('assistant', answerText, assistantType);
        this.setLastAssistantAction({
          mode: 'chat',
          requestPayload: chatPayload,
          userInput: prompt,
          responseText: String(answerText || '')
        });
      } else {
        this.addMessage('assistant', `Error: ${result.error || 'Chat failed.'}`, 'error');
      }
    } catch (error) {
      this.addMessage('assistant', `Network error: ${error.message}`, 'error');
    } finally {
      this.removeTypingIndicator(typingId);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 17V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 11L12 7L16 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
      }
      this.updateInputControls();
    }
  }

  showTypingIndicator(label = 'Thinking...') {
    this.activeTypingIndicatorLabel = label;
    this.shouldAutoScrollToBottom = true;
    this.updateChatHistoryUI();
    return 'active';
  }

  removeTypingIndicator(indicatorId) {
    if (!indicatorId && !this.activeTypingIndicatorLabel) return;
    this.activeTypingIndicatorLabel = '';
    this.updateChatHistoryUI();
  }

  adjustInputHeight() {
    const input = document.getElementById('nubra-code-input');
    if (!input) return;

    const isEmpty = !input.value || !input.value.trim();
    if (isEmpty) {
      input.style.height = '28px';
      return;
    }

    input.style.height = 'auto';
    const nextHeight = Math.min(Math.max(input.scrollHeight, 40), 140);
    input.style.height = `${nextHeight}px`;
  }

  updateInputControls() {
    const input = document.getElementById('nubra-code-input');
    const sendBtn = document.getElementById('nubra-send-btn');
    const inputShell = document.querySelector('.nubra-input-shell');
    if (!input) return;

    const hasText = !!input.value.trim();
    if (sendBtn) {
      sendBtn.disabled = !hasText;
    }
    if (inputShell) {
      inputShell.classList.toggle('has-text', hasText);
    }
  }

  async handleSubmit() {
    if (this.currentMode === 'convert') {
      await this.handleConvert();
      return;
    }
    await this.handleChat();
  }

  addMessage(role, content, type = 'normal') {
    if (!this.currentSession) {
      this.createNewSession();
    }

    const message = {
      role,
      content,
      type,
      timestamp: new Date().toISOString()
    };
    
    this.currentSession.messages.push(message);
    this.activeSessionId = this.currentSession.id;
    this.shouldAutoScrollToBottom = true;
    if (role === 'assistant') {
      this.pendingAssistantAnimationTimestamp = message.timestamp;
    }
    this.currentSession.updatedAt = new Date().toISOString();
    if (role === 'user') {
      this.updateSessionMetadataFromInput(content);
    }
    this.saveAllSessions();
    this.updateChatHistoryUI();
  }

  updateChatHistoryUI() {
    const chatHistory = document.getElementById('nubra-chat-history');
    
    if (!chatHistory) return;

    if (this.currentView === 'history') {
      this.showAllSessions();
      return;
    }
    
    if (this.currentSession && this.currentSession.messages.length > 0) {
      const messages = this.currentSession.messages;
      const latestAssistantIdx = (() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i] && messages[i].role === 'assistant') return i;
        }
        return -1;
      })();

      chatHistory.innerHTML = messages.map((msg, idx) => {
        if (msg.role === 'user') {
          return `
            <div class="nubra-message nubra-user-message">
              <div class="nubra-message-row">
                <div class="nubra-message-main">
                  <div class="nubra-message-content ${msg.type ? `type-${msg.type}` : ''}">
                    <pre>${this.escapeHtml(msg.content)}</pre>
                  </div>
                  <div class="nubra-message-time">${this.formatTime(msg.timestamp)}</div>
                </div>
                <div class="nubra-message-avatar nubra-user-avatar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21a8 8 0 10-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </div>
              </div>
            </div>
          `;
        } else {
          const shouldAnimateAssistant =
            this.pendingAssistantAnimationTimestamp &&
            msg.timestamp === this.pendingAssistantAnimationTimestamp;
          const latestAssistantClass = shouldAnimateAssistant ? ' nubra-assistant-latest' : '';
          const shouldShowRegenerate =
            idx === latestAssistantIdx &&
            !!this.getLastAssistantAction() &&
            msg.type !== 'error' &&
            !this.activeTypingIndicatorLabel;
          return `
            <div class="nubra-message nubra-assistant-message${latestAssistantClass}" data-ts="${msg.timestamp}">
              <div class="nubra-message-row">
                <div class="nubra-message-avatar nubra-assistant-avatar">
                  <img src="${this.icon32Url}" alt="Nubra">
                </div>
                <div class="nubra-message-main">
                  <div class="nubra-message-content ${msg.type === 'error' ? 'error' : ''} ${msg.type ? `type-${msg.type}` : ''}">
                    ${this.formatAssistantResponse(msg.content)}
                  </div>
                  <div class="nubra-message-meta">
                    <div class="nubra-message-time">${this.formatTime(msg.timestamp)}</div>
                    ${shouldShowRegenerate ? this.renderRegenerateButton() : ''}
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      }).join('');
      if (this.pendingAssistantAnimationTimestamp) {
        this.animateAssistantMessageByTimestamp(this.pendingAssistantAnimationTimestamp);
      }
      this.pendingAssistantAnimationTimestamp = null;

      if (this.activeTypingIndicatorLabel) {
        chatHistory.innerHTML += `
          <div class="nubra-message nubra-assistant-message nubra-typing-indicator">
            <div class="nubra-message-row">
              <div class="nubra-message-avatar nubra-assistant-avatar">
                <img src="${this.icon32Url}" alt="Nubra">
              </div>
              <div class="nubra-message-main">
                <div class="nubra-message-content">
                  <div class="nubra-typing-line">
                    <span>${this.escapeHtml(this.activeTypingIndicatorLabel)}</span>
                    <span class="nubra-typing-dots"><span></span><span></span><span></span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      this.showWelcomeMessage();
    }

    if (this.shouldAutoScrollToBottom) {
      requestAnimationFrame(() => {
        chatHistory.scrollTop = chatHistory.scrollHeight;
      });
      this.shouldAutoScrollToBottom = false;
    }
  }

  animateAssistantMessageByTimestamp(timestamp) {
    const container = document.querySelector(`.nubra-assistant-message[data-ts="${timestamp}"] .nubra-message-content`);
    if (!container || typeof container.animate !== 'function') return;

    container.animate(
      [
        { opacity: 0, transform: 'translateY(8px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        fill: 'both'
      }
    );

    const lines = container.querySelectorAll('.nubra-md-heading, .nubra-md-paragraph, .nubra-md-list li, .nubra-code-block');
    lines.forEach((line, index) => {
      if (typeof line.animate !== 'function') return;
      line.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        {
          duration: 260,
          delay: Math.min(index * 32, 260),
          easing: 'ease-out',
          fill: 'both'
        }
      );
    });
  }

  showAllSessions() {
    const chatHistory = document.getElementById('nubra-chat-history');
    
    if (!chatHistory) return;
    
    const orderedSessions = [...this.allSessions].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });

    const filteredSessions = orderedSessions.filter((session) => {
      if (!this.sessionSearchQuery) return true;
      const haystack = [
        session.title || session.name || '',
        session.category || '',
        session.brokerHint || ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(this.sessionSearchQuery);
    });

    const sessionsHtml = filteredSessions.map((session) => {
      const isActive = this.currentSession && session.id === this.currentSession.id;
      const messageCount = session.messages.length;
      const lastMessage = session.messages[session.messages.length - 1];
      const lastTime = lastMessage ? this.formatTime(lastMessage.timestamp) : 'No messages';
      const isEditing = this.editingSessionId === session.id;
      
      return `
        <div class="nubra-session-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
          <div class="nubra-session-header">
            <div class="nubra-session-info">
              ${
                isEditing
                  ? `
                    <div class="nubra-session-rename-row">
                      <input
                        id="nubra-edit-session-input"
                        class="nubra-session-rename-input"
                        data-session-id="${session.id}"
                        value="${this.escapeHtml(session.title || session.name || 'Session')}"
                        maxlength="80"
                        type="text"
                      />
                      <button class="nubra-rename-action-btn save" data-action="save-rename-session" data-session-id="${session.id}" title="Save">Save</button>
                      <button class="nubra-rename-action-btn cancel" data-action="cancel-rename-session" data-session-id="${session.id}" title="Cancel">Cancel</button>
                    </div>
                  `
                  : `<h4>${this.escapeHtml(session.title || session.name || 'Session')}</h4>`
              }
              <p>${this.escapeHtml(session.brokerHint || 'Generic')} - ${this.escapeHtml(session.category || 'General Question')}</p>
              <p>${messageCount} msgs - ${lastTime}</p>
            </div>
            <div class="nubra-session-actions">
              <button class="nubra-pin-session-btn ${session.pinned ? 'pinned' : ''}" data-action="pin-session" data-session-id="${session.id}" title="${session.pinned ? 'Unpin' : 'Pin'}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 3h6l-1.5 5.5L17 12H7l3.5-3.5L9 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                  <path d="M12 12v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <button class="nubra-rename-session-btn" data-action="start-rename-session" data-session-id="${session.id}" title="Rename">
                Rename
              </button>
              <button class="nubra-load-session-btn" data-action="load-session" data-session-id="${session.id}">
                Load
              </button>
              <button class="nubra-delete-session-btn" data-action="delete-session" data-session-id="${session.id}">
                Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    chatHistory.innerHTML = `
      <div class="nubra-sessions-list">
        <h3>All Sessions</h3>
        <div class="nubra-session-search-wrap">
          <input
            id="nubra-session-search-input"
            class="nubra-session-search-input"
            type="text"
            placeholder="Search sessions"
            value="${this.escapeHtml(this.sessionSearchQuery)}"
          />
        </div>
        ${filteredSessions.length === 0 ? '<p class="nubra-session-empty">No sessions match this search.</p>' : ''}
        ${sessionsHtml}
        <button class="nubra-back-btn" data-action="back-current">
          Back to Current Session
        </button>
      </div>
    `;
    
    // Scroll to top
    chatHistory.scrollTop = 0;
  }

  loadSession(sessionId) {
    const session = this.allSessions.find(s => s.id === sessionId);
    if (session) {
      this.editingSessionId = null;
      this.currentSession = this.ensureSessionState(session);
      this.activeSessionId = session.id;
      this.currentView = 'chat';
      this.saveUiState();
      this.saveAllSessions();
      this.updateChatHistoryUI();
      this.showMessage(`Loaded session: ${session.name}`, 'success');
    }
  }

  togglePinSession(sessionId) {
    const session = this.allSessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.pinned = !session.pinned;
    this.saveAllSessions();
    this.showAllSessions();
  }

  startSessionRename(sessionId) {
    const session = this.allSessions.find((s) => s.id === sessionId);
    if (!session) return;
    this.editingSessionId = sessionId;
    this.showAllSessions();
    requestAnimationFrame(() => {
      const input = document.getElementById('nubra-edit-session-input');
      if (input) {
        input.focus();
        if (typeof input.select === 'function') input.select();
      }
    });
  }

  cancelSessionRename() {
    this.editingSessionId = null;
    if (this.currentView === 'history') {
      this.showAllSessions();
    }
  }

  commitSessionRename(sessionId, rawName) {
    const session = this.allSessions.find((s) => s.id === sessionId);
    if (!session) {
      this.cancelSessionRename();
      return;
    }

    const name = String(rawName || '').trim();
    if (!name) {
      this.showMessage('Session name cannot be empty.', 'error');
      return;
    }

    session.title = name.slice(0, 80);
    session.name = session.title;
    session.updatedAt = new Date().toISOString();
    this.editingSessionId = null;
    this.saveAllSessions();
    if (this.currentView === 'history') {
      this.showAllSessions();
    }
    this.showMessage('Session renamed.', 'success');
  }

  deleteSession(sessionId) {
    if (confirm('Are you sure you want to delete this session? This cannot be undone.')) {
      this.allSessions = this.allSessions.filter(s => s.id !== sessionId);
      
      // If deleting current session, create new one
      if (this.currentSession.id === sessionId) {
        this.createNewSession();
      }
      
      this.saveAllSessions();
      this.showAllSessions(); // Refresh the list
      this.showMessage('Session deleted', 'info');
    }
  }

  formatAssistantResponse(content) {
    // Extract code blocks and add output actions
    const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textPart = content.substring(lastIndex, match.index).trim();
        if (textPart) {
          const renderedTextPart = this.formatAssistantTextPart(textPart);
          if (renderedTextPart) parts.push(renderedTextPart);
        }
      }
      
      // Add code block with compact actions
      const language = (match[1] || '').trim();
      const code = (match[2] || '').replace(/^\n+|\n+$/g, '');
      const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const strategyName = this.inferStrategyName(content, code);
      parts.push(`
        <div class="nubra-code-block">
          <div class="nubra-code-header">
            <span>${language ? this.escapeHtml(language.toUpperCase()) : 'Code'}</span>
            <div class="nubra-code-actions">
              <button
                class="nubra-code-action-btn nubra-copy-btn"
                data-action="copy-code"
                data-code-id="${codeId}"
                title="Copy"
                aria-label="Copy code"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="3" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
                  <rect x="4" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>
              <button
                class="nubra-code-action-btn nubra-download-btn"
                data-action="download-code"
                data-code-id="${codeId}"
                data-language="${this.escapeHtml(language)}"
                data-strategy="${this.escapeHtml(strategyName)}"
                title="Download"
                aria-label="Download code"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M4 20h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
          <pre><code id="${codeId}">${this.escapeHtml(code)}</code></pre>
        </div>
      `);
      
      lastIndex = codeBlockRegex.lastIndex;
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex).trim();
      if (remaining) {
        const renderedRemaining = this.formatAssistantTextPart(remaining);
        if (renderedRemaining) parts.push(renderedRemaining);
      }
    }
    
    return parts.join('');
  }

  formatAssistantTextPart(text) {
    const normalizedText = this.normalizeAssistantSectionText(
      this.removeEmptyMarkdownHeadings(String(text || ''))
    );
    if (!normalizedText.trim()) return '';
    const isWarning =
      /(^|\n)\s*(?:#{0,6}\s*)?(warning|important|caution|mandatory|must|constraint)\b[:\-]?/i.test(normalizedText) ||
      /[?]/.test(normalizedText);
    const hasExplanationHeading = /(^|\n)\s*#{0,6}\s*Explanation\b/i.test(normalizedText);
    const hasSummaryHeading = /(^|\n)\s*#{0,6}\s*Summary\b/i.test(normalizedText);
    const rendered = this.renderAssistantRichText(normalizedText);
    if (!rendered.trim()) return '';
    if (hasExplanationHeading || normalizedText.length > 700) {
      return `
        <details class="nubra-text-collapsible">
          <summary>Explanation (expand)</summary>
          <div class="nubra-text">${rendered}</div>
        </details>
      `;
    }
    if (isWarning) {
      return `<div class="nubra-text warning"><span class="nubra-warning-icon">&#9888;</span>${rendered}</div>`;
    }
    if (hasSummaryHeading) {
      return `<section class="nubra-text nubra-summary-block">${rendered}</section>`;
    }
    return `<div class="nubra-text">${rendered}</div>`;
  }

  normalizeAssistantSectionText(text) {
    return String(text || '').replace(
      /^\s*(summary|converted code|changes|notes|next steps|errors?)\s*:?\s*$/gim,
      '## $1'
    );
  }

  renderAssistantRichText(text) {
    const escaped = this.escapeHtml(text);
    const lines = escaped.split(/\r?\n/);
    const parts = [];
    let listItems = [];

    const flushList = () => {
      if (listItems.length > 0) {
        parts.push(`<ul class="nubra-md-list">${listItems.join('')}</ul>`);
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }

      const headingMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
      const plainHeadingMatch = trimmed.match(
        /^(summary|converted code|changes|notes|next steps|assumptions|errors?)\s*:?\s*$/i
      );
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);

      if (headingMatch || plainHeadingMatch) {
        flushList();
        const headingText = headingMatch ? headingMatch[1] : plainHeadingMatch[1];
        parts.push(`<div class="nubra-md-heading">${this.formatInlineAssistantText(headingText)}</div>`);
        return;
      }

      if (bulletMatch || numberedMatch) {
        const item = bulletMatch ? bulletMatch[1] : numberedMatch[1];
        listItems.push(`<li>${this.formatInlineAssistantText(item)}</li>`);
        return;
      }

      flushList();
      parts.push(`<p class="nubra-md-paragraph">${this.formatInlineAssistantText(trimmed)}</p>`);
    });

    flushList();
    return parts.join('');
  }

  removeEmptyMarkdownHeadings(text) {
    const lines = String(text || '').split(/\r?\n/);
    const kept = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      const isHeading = /^#{1,6}\s+.+$/.test(trimmed);
      if (!isHeading) {
        kept.push(line);
        continue;
      }

      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      const hasBody = j < lines.length && !/^#{1,6}\s+.+$/.test(lines[j].trim());
      if (hasBody) {
        kept.push(line);
      }
    }

    return kept.join('\n');
  }

  formatInlineAssistantText(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  inferStrategyName(responseText, codeText) {
    const response = String(responseText || '');
    const code = String(codeText || '');
    const blockedNames = new Set([
      'summary',
      'explanation',
      'notes',
      'note',
      'code',
      'converted_code',
      'required_parameter_updates',
      'required_updates',
      'output',
      'response'
    ]);
    const isBlocked = (name) => blockedNames.has(String(name || '').trim().toLowerCase());

    const headingMatch = response.match(/^\s*#{1,6}\s*([^\n#]{3,80})/m);
    if (headingMatch && headingMatch[1]) {
      const slug = this.slugifyName(headingMatch[1]);
      if (slug && !isBlocked(slug)) return slug;
    }

    const fnMatch = code.match(/\b(?:def|function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (fnMatch && fnMatch[1]) {
      const slug = this.slugifyName(fnMatch[1].replace(/^get_|^set_|^run_/, ''));
      if (slug && !isBlocked(slug)) return slug;
    }

    const classMatch = code.match(/\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/);
    if (classMatch && classMatch[1]) {
      const slug = this.slugifyName(classMatch[1]);
      if (slug && !isBlocked(slug)) return slug;
    }

    const sessionTitle = this.currentSession && (this.currentSession.title || this.currentSession.name)
      ? String(this.currentSession.title || this.currentSession.name)
      : '';
    const sessionSlug = this.slugifyName(sessionTitle.replace(/\b(session|general question)\b/ig, '').trim());
    if (sessionSlug && !isBlocked(sessionSlug)) return sessionSlug;

    return 'strategy_code';
  }

  slugifyName(value) {
    const text = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[`'"]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    return text.slice(0, 64);
  }

  getFileExtension(languageHint, codeText) {
    const lang = String(languageHint || '').trim().toLowerCase();
    if (lang === 'python' || lang === 'py') return 'py';
    if (lang === 'javascript' || lang === 'js' || lang === 'node') return 'js';
    if (lang === 'typescript' || lang === 'ts') return 'ts';
    if (lang === 'pinescript' || lang === 'pine') return 'pine';
    if (lang === 'json') return 'json';
    if (lang === 'bash' || lang === 'shell' || lang === 'sh') return 'sh';

    const code = String(codeText || '');
    if (/^\s*import\s+\w+|^\s*def\s+\w+/m.test(code)) return 'py';
    if (/\bfunction\s+\w+|=>|console\.log\(/.test(code)) return 'js';
    if (/\bstrategy\(|indicator\(/.test(code)) return 'pine';
    return 'txt';
  }

  downloadCode(codeId, languageHint = '', strategyHint = '') {
    const codeElement = document.getElementById(codeId);
    if (!codeElement) {
      this.showMessage('Code block not found.', 'error');
      return;
    }

    const codeText = String(codeElement.textContent || '');
    const extension = this.getFileExtension(languageHint, codeText);
    const baseName = this.slugifyName(strategyHint) || this.inferStrategyName('', codeText);
    const fileName = `${baseName}.${extension}`;

    try {
      const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.showMessage(`Downloaded ${fileName}`, 'success');
    } catch (error) {
      this.showMessage('Download failed.', 'error');
    }
  }

  copyCode(codeId) {
    const codeElement = document.getElementById(codeId);
    if (codeElement) {
      navigator.clipboard.writeText(codeElement.textContent).then(() => {
        this.showMessage('Code copied to clipboard!', 'success');
      }).catch(() => {
        this.showMessage('Failed to copy code', 'error');
      });
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  showMessage(text, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `nubra-toast nubra-toast-${type}`;
    toast.textContent = text;
    
    document.body.appendChild(toast);
    
    // Auto remove quickly to avoid obscuring UI.
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 1400);
  }
}

if (!window.__nubraAssistantInitialized) {
  window.__nubraAssistantInitialized = true;
  window.nubraAssistant = new window.NubraAIAssistant();
}

// Listen for messages from background script
if (!window.__nubraMessageListenerAdded) {
  window.__nubraMessageListenerAdded = true;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request);

    if (request.action === 'toggleSidebar' && window.nubraAssistant) {
      console.log('ToggleSidebar action detected, calling toggleSidebar');
      window.nubraAssistant.toggleSidebar();
      sendResponse({ success: true });
    } else if (request.action === 'captureSelectionForNubra' && window.nubraAssistant) {
      const selectedText = request && request.payload && request.payload.text ? request.payload.text : '';
      window.nubraAssistant.openSidebarDefault();
      window.nubraAssistant.setMode('convert');
      const input = document.getElementById('nubra-code-input');
      if (input) {
        input.value = selectedText;
        window.nubraAssistant.adjustInputHeight();
      }
      window.nubraAssistant.showMessage('Code captured from webpage', 'info');
      sendResponse({ success: true });
    } else {
      console.log('Unknown action or nubraAssistant not ready');
      sendResponse({ success: false, error: 'Unknown action or assistant not ready' });
    }

    // Return true to indicate we'll send response asynchronously
    return true;
  });
}









