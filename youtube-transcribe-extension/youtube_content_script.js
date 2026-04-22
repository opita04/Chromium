/**
 * YouTube Transcript AI Analyzer - Refactored Content Script
 * Persona: Senior Frontend Architect & Avant-Garde UI Designer
 */

(function () {
  'use strict';

  // --- Constants & Configuration ---
  const CONFIG = {
    STORAGE_KEYS: {
      TEMPLATES: 'yt_transcript_analysis_templates',
      SELECTED_TEMPLATE: 'yt_transcript_selected_template_id',
      COLLAPSED: 'yt_transcript_icon_bar_collapsed'
    },
    SELECTORS: {
      TRANSCRIPT_PANELS: [
        '[target-id="engagement-panel-searchable-transcript"]',
        '[target-id="PAmodern_transcript_view"]',
        '[target-id*="transcript" i]',
        'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]',
        'ytd-macro-markers-list-renderer',
        '#panels ytd-engagement-panel-section-list-renderer[target-id*="macro-markers" i]'
      ],
      TRANSCRIPT_ROWS: [
        'ytd-transcript-segment-view-model',
        'transcript-segment-view-model',
        'ytd-transcript-segment-renderer',
        '.segment-text',
        '.segment-title',
        '[role="listitem"]',
        'ytd-transcript-segment-list-renderer > *'
      ],
      VIDEO_TITLE: [
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.title.ytd-video-primary-info-renderer',
        'meta[name="title"]',
        'meta[property="og:title"]'
      ]
    },
    DEFAULT_TEMPLATE: {
      id: 'default',
      name: 'Default Analysis',
      template: `Title: "{{Title}}"\nTranscript: "{{Text}}"\n\nProvide a structured analysis with: \n1. Takeaways\n2. Key Points`
    }
  };

  /**
   * Manages transcript extraction and panel interactions.
   */
  class TranscriptManager {
    constructor() {
      this.panelSelectors = CONFIG.SELECTORS.TRANSCRIPT_PANELS;
      this.rowSelectors = CONFIG.SELECTORS.TRANSCRIPT_ROWS;
    }

    async openPanel(retry = 0) {
      if (this.getVisiblePanel()) return true;

      // Ensure we don't click buttons inside engagement panels
      const isEngagementPanelBtn = (el) => el.closest && el.closest('ytd-engagement-panel-section-list-renderer, tp-yt-app-drawer');

      const directTxBtn = document.querySelector('ytd-video-description-transcript-section-renderer button, button[aria-label="Show transcript" i]');
      let transcriptBtn = directTxBtn;
      
      if (!transcriptBtn || isEngagementPanelBtn(transcriptBtn)) {
         transcriptBtn = Array.from(document.querySelectorAll('button, [role="button"], ytd-button-renderer'))
           .find(el => {
             if (isEngagementPanelBtn(el)) return false;
             const text = (el.innerText || el.textContent || '').toLowerCase().trim();
             return text === 'show transcript' || text === 'transcript';
           });
      }

      if (transcriptBtn && transcriptBtn.offsetParent !== null) {
        try { transcriptBtn.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
        await new Promise(r => setTimeout(r, 400));
        transcriptBtn.click();
        
        // Wait until it appears (up to 40 attempts = 20s)
        for(let i=0; i<40; i++) {
           await new Promise(r => setTimeout(r, 500));
           if (this.getVisiblePanel()) return true;
        }
        return false;
      }

      // If hidden, expand the description first
      const expandBtn = document.querySelector('#description-inline-expander, #description #expand, ytd-watch-metadata #expand, ytd-text-inline-expander[is-collapsed] #expand');
      if (expandBtn && expandBtn.offsetParent !== null && retry < 5) {
        try { expandBtn.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(e) {}
        await new Promise(r => setTimeout(r, 400));
        expandBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return this.openPanel(retry + 1);
      }
      
      return false;
    }

    getVisiblePanel() {
      let panels = Array.from(document.querySelectorAll(this.panelSelectors.join(',')));
      
      const backupNodes = document.querySelectorAll('ytd-transcript-segment-renderer, ytd-transcript-segment-view-model, transcript-segment-view-model');
      backupNodes.forEach(node => {
          const panel = node.closest('ytd-engagement-panel-section-list-renderer, tp-yt-app-drawer, div#panel');
          if (panel && !panels.includes(panel)) panels.push(panel);
      });

      return panels.find(p => {
        const style = window.getComputedStyle(p);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

        const rect = p.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        
        const isOffScreen = rect.left >= window.innerWidth || rect.right <= 0 || rect.top >= window.innerHeight || rect.bottom <= 0;
        if (isOffScreen) return false;

        return true;
      });
    }

    async getTranscriptText(retries = 0) {
      if (retries > 30) return null; // Prevent infinite loop (30 retries = ~30s elapsed)

      const panel = this.getVisiblePanel();
      if (!panel) {
        if (retries < 30) {
          await new Promise(r => setTimeout(r, 1000));
          return this.getTranscriptText(retries + 1);
        }
        return null;
      }

      let rows = [];
      for (const selector of this.rowSelectors) {
        rows = panel.querySelectorAll(selector);
        if (rows.length > 0) break;
      }

      if (rows.length === 0) {
        for (const selector of this.rowSelectors) {
          rows = document.querySelectorAll(selector);
          if (rows.length > 0) break;
        }
      }

      const spinner = panel.querySelector('tp-yt-paper-spinner, .tp-yt-paper-spinner');
      const isLoading = spinner && spinner.style.display !== 'none' && spinner.offsetParent !== null;

      if (rows.length === 0 || isLoading) {
        // Wait for segments to load
        await new Promise(r => setTimeout(r, 1000));
        return this.getTranscriptText(retries + 1);
      }

      // Use textContent instead of innerText to prevent extremely expensive layout reflows on huge transcripts
      const text = Array.from(rows)
        .map(row => row.textContent.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 0)
        .join('\n');
        
      if (text.length < 50 && retries < 30) {
          // May be still rendering initial skeleton
          await new Promise(r => setTimeout(r, 1000));
          return this.getTranscriptText(retries + 1);
      }
        
      return text;
    }

    getVideoTitle() {
      for (const sel of CONFIG.SELECTORS.VIDEO_TITLE) {
        const el = document.querySelector(sel);
        if (el) {
          return (el.content || el.innerText || '').trim();
        }
      }
      return 'Untitled Video';
    }
  }

  /**
   * Manages the analysis templates and persistent storage.
   */
  class TemplateManager {
    constructor() {
      this.storage = chrome.storage?.local;
    }

    async getTemplates() {
      if (!this.storage) return [CONFIG.DEFAULT_TEMPLATE];
      const result = await this.storage.get([CONFIG.STORAGE_KEYS.TEMPLATES]);
      const templates = result[CONFIG.STORAGE_KEYS.TEMPLATES];
      return Array.isArray(templates) && templates.length > 0 ? templates : [CONFIG.DEFAULT_TEMPLATE];
    }

    async getSelectedTemplate() {
      if (!this.storage) return CONFIG.DEFAULT_TEMPLATE;
      const [templates, selection] = await Promise.all([
        this.getTemplates(),
        this.storage.get([CONFIG.STORAGE_KEYS.SELECTED_TEMPLATE])
      ]);
      const id = selection[CONFIG.STORAGE_KEYS.SELECTED_TEMPLATE];
      return templates.find(t => t.id === id) || templates[0];
    }

    async saveTemplate(tpl) {
      const templates = await this.getTemplates();
      const idx = templates.findIndex(t => t.id === tpl.id);
      if (idx !== -1) templates[idx] = tpl;
      else templates.push(tpl);
      await this.storage.set({ [CONFIG.STORAGE_KEYS.TEMPLATES]: templates });
    }

    async deleteTemplate(id) {
      if (id === 'default') return;
      let templates = await this.getTemplates();
      templates = templates.filter(t => t.id !== id);
      await this.storage.set({ [CONFIG.STORAGE_KEYS.TEMPLATES]: templates });
    }
  }

  /**
   * Manages the floating UI and user interactions.
   * "Intentional Minimalism" design philosophy.
   */
  class UIManager {
    constructor(transcriptManager, templateManager) {
      this.tm = transcriptManager;
      this.tplm = templateManager;
      this.barId = 'yt-bespoke-ai-bar';
      this.styleId = 'yt-bespoke-styles';
      this.platforms = [
        { id: 'chatgpt', name: 'ChatGPT', icon: 'images/icons8-chatgpt.svg' },
        { id: 'claude', name: 'Claude', icon: 'images/claude-color.svg' },
        { id: 'gemini', name: 'Gemini', icon: 'images/gemini-color.svg' },
        { id: 'mistral', name: 'Mistral', icon: 'images/mistral-color.svg' },
        { id: 'grok', name: 'Grok', icon: 'images/grok.svg' },
        { id: 'deepseek', name: 'DeepSeek', icon: 'images/deepseek-color.svg' }
      ];
    }

    injectStyles() {
      if (document.getElementById(this.styleId)) return;
      const style = document.createElement('style');
      style.id = this.styleId;
      style.textContent = `
        #${this.barId} {
          position: fixed;
          top: 50%;
          right: 16px;
          transform: translateY(-50%) translateX(20px);
          z-index: 2147483647;
          background: rgba(18, 18, 18, 0.6);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 32px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
          transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
          opacity: 0;
          pointer-events: auto;
          max-height: 85vh;
          overflow-y: auto;
          scrollbar-width: none; /* Hide scrollbar Firefox */
        }
        #${this.barId}::-webkit-scrollbar {
          display: none; /* Hide scrollbar Chrome/Safari */
        }
        #${this.barId}.visible {
          transform: translateY(-50%) translateX(0);
          opacity: 1;
        }
        #${this.barId}:hover {
          background: rgba(22, 22, 22, 0.75);
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
        }
        #${this.barId} button {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          color: rgba(255, 255, 255, 0.7);
          overflow: hidden;
        }
        #${this.barId} button:hover {
          background: rgba(255, 255, 255, 0.12);
          transform: scale(1.1);
          color: white;
        }
        #${this.barId} button:active {
          transform: scale(0.95);
        }
        #${this.barId} .platform-icon {
          width: 22px;
          height: 22px;
          filter: grayscale(1) opacity(0.85);
          transition: all 0.4s ease;
          display: block;
          object-fit: contain;
        }
        #${this.barId} button:hover .platform-icon {
          filter: grayscale(0) opacity(1);
          transform: rotate(5deg);
        }
        .yt-bespoke-toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%) translateY(30px);
          background: rgba(30, 30, 30, 0.85);
          backdrop-filter: blur(12px);
          color: #eee;
          padding: 14px 28px;
          border-radius: 40px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.3px;
          z-index: 2147483647;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.1);
          opacity: 0;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .yt-bespoke-toast.visible {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        
        /* Modal Styles */
        .yt-bespoke-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(8px);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .yt-bespoke-overlay.visible { opacity: 1; }
        .yt-bespoke-modal {
          background: #121212;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 32px;
          width: 500px;
          max-width: 90vw;
          box-shadow: 0 24px 64px rgba(0,0,0,0.8);
          transform: scale(0.9);
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          color: #eee;
        }
        .yt-bespoke-overlay.visible .yt-bespoke-modal { transform: scale(1); }
      `;
      document.head.appendChild(style);
    }

    createBar() {
      if (document.getElementById(this.barId)) return;
      const bar = document.createElement('div');
      bar.id = this.barId;

      this.platforms.forEach(p => {
        const btn = document.createElement('button');
        btn.title = p.name;

        const iconUrl = chrome.runtime.getURL(p.icon);
        btn.innerHTML = `<img src="${iconUrl}" class="platform-icon" alt="${p.name}">`;

        btn.onclick = (e) => {
          e.stopPropagation();
          this.handleAction(p.id);
        };
        bar.appendChild(btn);
      });

      const separator = document.createElement('div');
      separator.style.height = '1px';
      separator.style.background = 'rgba(255,255,255,0.1)';
      separator.style.margin = '4px 8px';
      bar.appendChild(separator);

      const copyBtn = document.createElement('button');
      copyBtn.title = 'Copy Unique Transcript';
      copyBtn.innerHTML = '<span style="font-size: 18px;">📋</span>';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        this.handleAction('copy');
      };
      bar.appendChild(copyBtn);

      const settingsBtn = document.createElement('button');
      settingsBtn.title = 'Settings & Templates';
      settingsBtn.innerHTML = '<span style="font-size: 18px;">⚙️</span>';
      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        this.openSettings();
      };
      bar.appendChild(settingsBtn);

      document.body.appendChild(bar);
      requestAnimationFrame(() => bar.classList.add('visible'));
    }

    async handleAction(actionId) {
      const toastId = this.showToast('Step 1: Expanding Description...', 30000);
      try {
        const expandBtn = document.querySelector('ytd-text-inline-expander[is-collapsed] #expand, ytd-watch-metadata #description-inline-expander');
        if (expandBtn && expandBtn.offsetParent !== null) {
           expandBtn.click();
           await new Promise(r => setTimeout(r, 800));
        }

        const toastMsg = document.getElementById(toastId);
        if (toastMsg) toastMsg.innerText = 'Step 2: Searching for Transcript Button...';

        const success = await this.tm.openPanel();
        if (!success) throw new Error('Could not find transcript button in DOM.');

        if (toastMsg) toastMsg.innerText = 'Step 3: Reading Transcript Content...';

        const [text, templateObj] = await Promise.all([
          this.tm.getTranscriptText(),
          this.tplm.getSelectedTemplate()
        ]);

        if (!text) throw new Error('Transcript empty or still loading.');

        const title = this.tm.getVideoTitle();
        const fullPrompt = templateObj.template
          .replace(/{{Title}}/g, title)
          .replace(/{{Text}}/g, text);

        if (actionId === 'copy') {
          await navigator.clipboard.writeText(fullPrompt);
          this.hideToast(toastId);
          this.showToast('Copied to clipboard. Ready for paste.');
        } else {
          const platform = this.platforms.find(p => p.id === actionId);
          chrome.runtime.sendMessage({
            type: "OPEN_AI_PLATFORM",
            platformId: actionId,
            analysisPrompt: fullPrompt
          });
          this.hideToast(toastId);
          this.showToast(`Relaying to ${platform.name}...`);
        }
      } catch (err) {
        this.hideToast(toastId);
        this.showToast(`Error: ${err.message}`, 5000);
      }
    }

    openSettings() {
      const overlay = document.createElement('div');
      overlay.className = 'yt-bespoke-overlay';
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('visible');
          setTimeout(() => overlay.remove(), 300);
        }
      };

      const modal = document.createElement('div');
      modal.className = 'yt-bespoke-modal';
      modal.innerHTML = `
        <h2 style="margin: 0 0 24px 0; font-weight: 300; font-size: 24px; letter-spacing: -0.5px;">Refined Templates</h2>
        <div id="templates-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 24px;"></div>
        <div style="display: flex; justify-content: flex-end;">
          <button id="close-modal" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 10px 24px; border-radius: 20px; cursor: pointer;">Dismiss</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('visible'));

      modal.querySelector('#close-modal').onclick = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
      };

      this.renderTemplates(modal.querySelector('#templates-list'));
    }

    async renderTemplates(container) {
      const templates = await this.tplm.getTemplates();
      const selected = await this.tplm.getSelectedTemplate();

      container.innerHTML = '';
      templates.forEach(t => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 16px;
          margin-bottom: 12px;
          background: ${t.id === selected.id ? 'rgba(255,255,255,0.05)' : 'transparent'};
          border: 1px solid ${t.id === selected.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'};
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 500; font-size: 15px;">${t.name}</span>
            <span style="font-size: 12px; color: #666;">${t.id === 'default' ? 'System' : 'Custom'}</span>
          </div>
          <div style="font-size: 12px; color: #888; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${t.template.substring(0, 60)}...
          </div>
        `;

        item.onclick = async () => {
          await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.SELECTED_TEMPLATE]: t.id });
          this.showToast(`Selected: ${t.name}`);
          this.renderTemplates(container);
        };

        container.appendChild(item);
      });
    }

    showToast(msg, duration = 3000) {
      const toast = document.createElement('div');
      const id = 'toast-' + Date.now();
      toast.id = id;
      toast.className = 'yt-bespoke-toast';
      toast.textContent = msg;
      document.body.appendChild(toast);

      requestAnimationFrame(() => toast.classList.add('visible'));

      if (duration < 10000) {
        setTimeout(() => this.hideToast(id), duration);
      }
      return id;
    }

    hideToast(id) {
      const toast = document.getElementById(id);
      if (toast) {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
      }
    }
  }


  // --- Main Initialization ---
  function init() {
    if (window.location.pathname !== '/watch') return;

    const tm = new TranscriptManager();
    const tplm = new TemplateManager();
    const ui = new UIManager(tm, tplm);

    ui.injectStyles();
    ui.createBar();
  }

  // Handle SPA navigation
  let lastPath = '';
  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (lastPath === '/watch') {
        setTimeout(init, 2000);
      } else {
        const bar = document.getElementById('yt-bespoke-ai-bar');
        if (bar) bar.remove();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  init();

})();
