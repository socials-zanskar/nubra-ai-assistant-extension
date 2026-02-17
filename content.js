// Content script for Nubra AI Assistant
// Injects floating button and sidebar functionality

console.log('Nubra AI Assistant content script loaded');

window.NubraAIAssistant = window.NubraAIAssistant || class NubraAIAssistant {
  constructor() {
    this.isOpen = false;
    this.currentSession = null;
    this.allSessions = [];
    this.currentMode = 'convert';
    this.defaultSidebarWidth = 450;
    this.sidebarWidth = this.defaultSidebarWidth;
    this.minSidebarWidth = 56;
    this.maxSidebarWidth = 900;
    this.isResizing = false;
    this.icon32Url = chrome.runtime.getURL('icons/icon32.png');
    this.icon48Url = chrome.runtime.getURL('icons/icon48.png');
    this.welcomeLogoUrl = chrome.runtime.getURL('icons/nubra.png');
    this.init();
  }

  init() {
    console.log('Initializing Nubra AI Assistant...');
    console.log('Document body:', document.body);
    this.loadAllSessions();
    this.createFloatingButton();
    this.createSidebar();
    // Setup event listeners AFTER sidebar is created and added to DOM
    this.setupEventListeners();
    console.log('Nubra AI Assistant initialization complete');
  }

  async loadAllSessions() {
    try {
      const result = await chrome.storage.local.get(['nubraAllSessions']);
      this.allSessions = (result.nubraAllSessions || []).map((session) => ({
        title: 'New Session',
        category: 'General Question',
        brokerHint: 'Generic',
        pinned: false,
        ...session
      }));
      
      // Load latest session if present, otherwise create a new one.
      if (this.allSessions.length > 0) {
        this.loadCurrentSession();
      } else {
        this.createNewSession();
      }
      this.updateChatHistoryUI();
    } catch (error) {
      console.log('Storage not available, using empty sessions');
      this.allSessions = [];
      this.createNewSession();
      this.updateChatHistoryUI();
    }
  }

  async saveAllSessions() {
    try {
      await chrome.storage.local.set({ nubraAllSessions: this.allSessions });
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
      messages: [],
      createdAt: new Date().toISOString()
    };
    this.allSessions.unshift(this.currentSession);
    this.saveAllSessions();
  }

  loadCurrentSession() {
    if (this.allSessions.length > 0) {
      this.currentSession = this.allSessions[0]; // Load most recent session
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
          <h3 class="nubra-header-title" id="nubra-header-home-title">Nubra AI Assistant</h3>
          <div class="nubra-mode-switch">
            <button class="nubra-mode-btn" id="nubra-mode-chat-btn">Chat</button>
            <button class="nubra-mode-btn active" id="nubra-mode-convert-btn">Code Convert</button>
          </div>
          <div class="nubra-header-actions">
            <button class="nubra-icon-action nubra-history-btn" id="nubra-history-btn" title="History">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="nubra-action-label">History</span>
            </button>
            <button class="nubra-icon-action nubra-new-session-btn" id="nubra-new-session-btn" title="New Session">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16m8-8H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="nubra-action-label">New Session</span>
            </button>
            <button class="nubra-icon-action nubra-close-btn" id="nubra-close-btn" title="Close">
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
                <button class="nubra-send-btn" id="nubra-send-btn" title="Send">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 17V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M8 11L12 7L16 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="nubra-clear-btn" id="nubra-clear-btn" title="Clear input">
                  <svg class="nubra-clear-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span class="nubra-clear-label">Clear</span>
                </button>
              </div>
            </div>
          </div>
          <div class="nubra-input-meta">
            <span>Ctrl/Cmd + Enter to send</span>
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
          bottom: 30px !important;
          right: 30px !important;
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
    this.showWelcomeMessage();
    this.showMessage('New session started! Previous session saved.', 'success');
  }

  showHistory() {
    if (this.allSessions.length === 0) {
      this.showMessage('No history yet. Start converting some code!', 'info');
      return;
    }
    
    // Show all sessions
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
  }

  setMode(mode) {
    this.currentMode = mode === 'convert' ? 'convert' : 'chat';
    this.updateModeUI();

    const chatHistory = document.getElementById('nubra-chat-history');
    if (chatHistory && chatHistory.querySelector('.nubra-sessions-list')) {
      this.updateChatHistoryUI();
    }
  }

  goToChatSection() {
    this.setMode('chat');
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
      input.placeholder = 'Ask anything about Nubra SDK...';
      this.adjustInputHeight();
    }
    this.updateInputControls();
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
        } else if (action === 'delete-session') {
          this.deleteSession(actionElement.dataset.sessionId);
        } else if (action === 'back-current') {
          this.showWelcomeMessage();
        } else if (action === 'copy-code') {
          this.copyCode(actionElement.dataset.codeId);
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
        codeInput.value = '';
        this.adjustInputHeight();
      } else {
        this.addMessage(
          'assistant',
          `Error: ${result.error || 'Conversion failed. Ensure backend is running on localhost:3000.'}`,
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
      this.setMode('chat');
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
    this.addMessage('user', prompt, 'user_text');

    const typingId = this.showTypingIndicator('Nubra AI is thinking...');

    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'chatQuery', payload: { prompt } }, (response) => {
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
        codeInput.value = '';
        this.adjustInputHeight();
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
    const chatHistory = document.getElementById('nubra-chat-history');
    if (!chatHistory) return null;

    const indicatorId = `typing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const indicator = document.createElement('div');
    indicator.className = 'nubra-message nubra-assistant-message nubra-typing-indicator';
    indicator.id = indicatorId;
    indicator.innerHTML = `
      <div class="nubra-message-row">
        <div class="nubra-message-avatar nubra-assistant-avatar">
          <img src="${this.icon32Url}" alt="Nubra">
        </div>
        <div class="nubra-message-main">
          <div class="nubra-message-content">
            <div class="nubra-typing-line">
              <span>${this.escapeHtml(label)}</span>
              <span class="nubra-typing-dots"><span></span><span></span><span></span></span>
            </div>
          </div>
        </div>
      </div>
    `;
    chatHistory.appendChild(indicator);
    indicator.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return indicatorId;
  }

  removeTypingIndicator(indicatorId) {
    if (!indicatorId) return;
    const indicator = document.getElementById(indicatorId);
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
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
    
    if (this.currentSession && this.currentSession.messages.length > 0) {
      chatHistory.innerHTML = this.currentSession.messages.map(msg => {
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
          return `
            <div class="nubra-message nubra-assistant-message">
              <div class="nubra-message-row">
                <div class="nubra-message-avatar nubra-assistant-avatar">
                  <img src="${this.icon32Url}" alt="Nubra">
                </div>
                <div class="nubra-message-main">
                  <div class="nubra-message-content ${msg.type === 'error' ? 'error' : ''} ${msg.type ? `type-${msg.type}` : ''}">
                    ${this.formatAssistantResponse(msg.content)}
                  </div>
                  <div class="nubra-message-time">${this.formatTime(msg.timestamp)}</div>
                </div>
              </div>
            </div>
          `;
        }
      }).join('');
    } else {
      this.showWelcomeMessage();
    }

    // Intentionally avoid forced auto-scroll so users keep their manual scroll position.
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

    const sessionsHtml = orderedSessions.map((session, index) => {
      const isActive = this.currentSession && session.id === this.currentSession.id;
      const messageCount = session.messages.length;
      const lastMessage = session.messages[session.messages.length - 1];
      const lastTime = lastMessage ? this.formatTime(lastMessage.timestamp) : 'No messages';
      
      return `
        <div class="nubra-session-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
          <div class="nubra-session-header">
            <div class="nubra-session-info">
              <h4>${this.escapeHtml(session.title || session.name || 'Session')}</h4>
              <p>${this.escapeHtml(session.brokerHint || 'Generic')} - ${this.escapeHtml(session.category || 'General Question')}</p>
              <p>${messageCount} msgs - ${lastTime}</p>
            </div>
            <div class="nubra-session-actions">
              <button class="nubra-pin-session-btn ${session.pinned ? 'pinned' : ''}" data-action="pin-session" data-session-id="${session.id}" title="${session.pinned ? 'Unpin' : 'Pin'}">
                📌
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
      this.currentSession = session;
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
    // Extract code blocks and add copy buttons
    const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textPart = content.substring(lastIndex, match.index).trim();
        if (textPart) {
          parts.push(this.formatAssistantTextPart(textPart));
        }
      }
      
      // Add code block with copy button
      const language = (match[1] || '').trim();
      const code = (match[2] || '').replace(/^\n+|\n+$/g, '');
      const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      parts.push(`
        <div class="nubra-code-block">
          <div class="nubra-code-header">
            <span>${language ? this.escapeHtml(language.toUpperCase()) : 'Code'}</span>
            <button class="nubra-copy-btn" data-action="copy-code" data-code-id="${codeId}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm-1 4H5V3h10v2zm-1 10H5V7h10v8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Copy
            </button>
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
        parts.push(this.formatAssistantTextPart(remaining));
      }
    }
    
    return parts.join('');
  }

  formatAssistantTextPart(text) {
    const isWarning = /(warning|mandatory|must|constraint|risk)/i.test(text);
    const rendered = this.renderAssistantRichText(text);
    if (text.length > 700) {
      return `
        <details class="nubra-text-collapsible">
          <summary>Explanation (expand)</summary>
          <div class="nubra-text ${isWarning ? 'warning' : ''}">${rendered}</div>
        </details>
      `;
    }
    if (isWarning) {
      return `<div class="nubra-text warning"><span class="nubra-warning-icon">?</span>${rendered}</div>`;
    }
    return `<div class="nubra-text">${rendered}</div>`;
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

      const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);

      if (headingMatch) {
        flushList();
        parts.push(`<div class="nubra-md-heading">${this.formatInlineAssistantText(headingMatch[1])}</div>`);
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

  formatInlineAssistantText(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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






