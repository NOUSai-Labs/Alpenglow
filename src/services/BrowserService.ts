/**
 * BrowserService — Agent-controlled WKWebView engine
 *
 * Singleton that manages the embedded browser. The agent calls this to
 * navigate, extract content, click elements, fill forms — anything a
 * browser can do, without touching Safari or leaving the app.
 *
 * Architecture:
 *   BrowserScreen mounts the WebView and registers its ref here.
 *   The agent calls BrowserService methods from tool handlers.
 *   JS injection + message passing bridges the native/web gap.
 */

import { createRef } from 'react';
import type WebView from 'react-native-webview';

// ── Types ──────────────────────────────────────────────────────────────

export interface PageInfo {
  url: string;
  title: string;
  content: string;  // Clean text, no HTML
  links: Array<{ text: string; href: string }>;
  inputs: Array<{ name: string; type: string; placeholder: string }>;
  loading: boolean;
}

export interface ExtractResult {
  url: string;
  title: string;
  text: string;
  markdown: string;
  links: Array<{ text: string; href: string }>;
}

export interface ClickResult {
  success: boolean;
  message: string;
}

type PendingMessage = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

// ── Singleton ──────────────────────────────────────────────────────────

class BrowserServiceClass {
  webviewRef = createRef<WebView>();
  private pendingMessages = new Map<string, PendingMessage>();
  private currentUrl = '';
  private currentTitle = '';
  private navigationCallback: ((url: string, title: string) => void) | null = null;
  private loadCallback: ((url: string) => void) | null = null;

  // Called by BrowserScreen when navigation happens
  onNavigate(url: string, title: string) {
    this.currentUrl = url;
    this.currentTitle = title;
    this.navigationCallback?.(url, title);
  }

  onLoad(url: string) {
    this.currentUrl = url;
    this.loadCallback?.(url);
  }

  // Called by BrowserScreen for WebView messages (JS → native responses)
  handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.__msgId && this.pendingMessages.has(msg.__msgId)) {
        const pending = this.pendingMessages.get(msg.__msgId)!;
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(msg.__msgId);
        if (msg.__error) {
          pending.reject(new Error(msg.__error));
        } else {
          pending.resolve(msg.__result);
        }
      }
    } catch { /* non-bridged message */ }
  }

  setNavigationCallback(fn: (url: string, title: string) => void) {
    this.navigationCallback = fn;
  }

  setLoadCallback(fn: (url: string) => void) {
    this.loadCallback = fn;
  }

  get isReady(): boolean {
    return this.webviewRef.current !== null;
  }

  get url(): string { return this.currentUrl; }
  get title(): string { return this.currentTitle; }

  // ── Navigation ───────────────────────────────────────────────────────

  navigate(url: string) {
    if (!this.webviewRef.current) throw new Error('Browser not mounted');
    // Ensure URL has scheme
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    this.webviewRef.current.injectJavaScript(`window.location.href = ${JSON.stringify(fullUrl)}; true;`);
    this.currentUrl = fullUrl;
  }

  back() {
    this.webviewRef.current?.goBack();
  }

  forward() {
    this.webviewRef.current?.goForward();
  }

  reload() {
    this.webviewRef.current?.reload();
  }

  // ── JS Execution with response ───────────────────────────────────────

  private async executeJS<T = any>(code: string, timeoutMs = 8000): Promise<T> {
    if (!this.webviewRef.current) throw new Error('Browser not mounted');

    const msgId = `nb_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const wrapped = `
      (function() {
        try {
          const __result = (function() { ${code} })();
          if (__result && typeof __result.then === 'function') {
            __result.then(r => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ __msgId: '${msgId}', __result: r }));
            }).catch(e => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ __msgId: '${msgId}', __error: e.message }));
            });
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ __msgId: '${msgId}', __result: __result }));
          }
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ __msgId: '${msgId}', __error: e.message }));
        }
      })();
      true;
    `;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(msgId);
        reject(new Error(`JS execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingMessages.set(msgId, { resolve, reject, timeout });
      this.webviewRef.current!.injectJavaScript(wrapped);
    });
  }

  // ── Content Extraction ───────────────────────────────────────────────

  async extract(): Promise<ExtractResult> {
    const result = await this.executeJS<ExtractResult>(`
      const title = document.title;
      const url = window.location.href;

      // Extract clean text — remove scripts, styles, nav boilerplate
      const clone = document.body.cloneNode(true);
      const junk = clone.querySelectorAll('script,style,nav,footer,iframe,noscript,[aria-hidden="true"]');
      junk.forEach(el => el.remove());

      // Convert to readable text
      const text = (clone.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 8000);

      // Basic markdown: headers, links
      const headings = [...document.querySelectorAll('h1,h2,h3')]
        .map(h => ('#'.repeat(parseInt(h.tagName[1])) + ' ' + h.textContent.trim()))
        .slice(0, 10);

      const links = [...document.querySelectorAll('a[href]')]
        .filter(a => a.textContent.trim().length > 1 && !a.href.startsWith('javascript'))
        .map(a => ({ text: a.textContent.trim().slice(0, 80), href: a.href }))
        .slice(0, 30);

      const markdown = headings.join('\\n') + '\\n\\n' + text.slice(0, 5000);

      return { url, title, text, markdown, links };
    `);
    return result;
  }

  // ── Interaction ──────────────────────────────────────────────────────

  async click(selector: string): Promise<ClickResult> {
    return this.executeJS<ClickResult>(`
      const el = document.querySelector(${JSON.stringify(selector)}) ||
        [...document.querySelectorAll('button,a,[role="button"]')]
          .find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(selector.toLowerCase())}));
      if (!el) return { success: false, message: 'Element not found: ' + ${JSON.stringify(selector)} };
      el.click();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { success: true, message: 'Clicked: ' + (el.textContent || el.tagName) };
    `);
  }

  async fill(selector: string, value: string): Promise<ClickResult> {
    return this.executeJS<ClickResult>(`
      const el = document.querySelector(${JSON.stringify(selector)}) ||
        [...document.querySelectorAll('input,textarea')]
          .find(e => (e.placeholder || e.name || e.id || '').toLowerCase().includes(${JSON.stringify(selector.toLowerCase())}));
      if (!el) return { success: false, message: 'Input not found: ' + ${JSON.stringify(selector)} };
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, message: 'Filled input with value' };
    `);
  }

  async submit(selector?: string): Promise<ClickResult> {
    return this.executeJS<ClickResult>(`
      const form = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.querySelector("form")'};
      if (!form) {
        // Try clicking primary button
        const btn = document.querySelector('button[type="submit"]') ||
                    document.querySelector('input[type="submit"]') ||
                    document.querySelector('button:not([type="button"])');
        if (btn) { btn.click(); return { success: true, message: 'Clicked submit button' }; }
        return { success: false, message: 'No form or submit button found' };
      }
      form.submit();
      return { success: true, message: 'Form submitted' };
    `);
  }

  async scroll(direction: 'down' | 'up' | 'bottom' | 'top', amount = 600) {
    const y = direction === 'down' ? amount : direction === 'up' ? -amount :
              direction === 'bottom' ? 99999 : -99999;
    await this.executeJS(`window.scrollBy(0, ${y}); return true;`);
  }

  async waitForElement(selector: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.executeJS<boolean>(`
        return !!document.querySelector(${JSON.stringify(selector)});
      `);
      if (found) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }

  // ── Search helpers ───────────────────────────────────────────────────

  async googleSearch(query: string) {
    this.navigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }

  async getPageInfo(): Promise<PageInfo> {
    const info = await this.executeJS<PageInfo>(`
      return {
        url: window.location.href,
        title: document.title,
        content: (document.body.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 3000),
        links: [...document.querySelectorAll('a[href]')]
          .filter(a => a.textContent.trim())
          .map(a => ({ text: a.textContent.trim().slice(0, 60), href: a.href }))
          .slice(0, 20),
        inputs: [...document.querySelectorAll('input,textarea,select')]
          .map(el => ({ name: el.name || el.id || '', type: el.type || 'text', placeholder: el.placeholder || '' }))
          .filter(i => i.name || i.placeholder),
        loading: document.readyState !== 'complete',
      };
    `);
    return info;
  }
}

export const BrowserService = new BrowserServiceClass();
