/**
 * Browser Tool — Agent-controlled WKWebView
 *
 * Gives the agent a full browser it can navigate, read, and interact with
 * without leaving the app. No Safari, no Chrome — 100% agent-controlled.
 *
 * Operations:
 *   navigate   — go to a URL
 *   search     — Google search (shorthand)
 *   read       — extract page content as text + markdown + links
 *   click      — click element by CSS selector or text content
 *   fill       — fill an input field
 *   submit     — submit a form
 *   scroll     — scroll the page
 *   back       — go back in history
 *   forward    — go forward in history
 *   reload     — reload current page
 *   info       — get current URL, title, inputs, links (quick snapshot)
 *   wait       — wait for an element to appear (up to 10 seconds)
 */
import { BrowserService } from '../services/BrowserService';

export const browserTool = {
  name: 'browser',
  description: [
    'Control the in-app browser. Navigate URLs, read page content, click elements, fill forms.',
    'Use this to browse the web, search Google, interact with web apps, read articles.',
    'Operations: navigate, search, read, click, fill, submit, scroll, back, forward, reload, info, wait.',
  ].join(' '),

  async execute(args: Record<string, unknown>): Promise<string> {
    const op = args.operation as string;

    if (!BrowserService.isReady) {
      return 'Browser not available — switch to the Browser tab first so it initializes.';
    }

    try {
      switch (op) {

        case 'navigate': {
          const url = args.url as string;
          if (!url) return 'navigate requires a url argument';
          BrowserService.navigate(url);
          // Give page a moment to start loading
          await new Promise(r => setTimeout(r, 500));
          return `Navigating to ${url}`;
        }

        case 'search': {
          const query = args.query as string;
          if (!query) return 'search requires a query argument';
          await BrowserService.googleSearch(query);
          await new Promise(r => setTimeout(r, 1500));
          const info = await BrowserService.getPageInfo();
          return `Searched for "${query}"\nURL: ${info.url}\n\nTop results:\n${
            info.links.slice(0, 8).map(l => `  • ${l.text}\n    ${l.href}`).join('\n')
          }`;
        }

        case 'read': {
          const result = await BrowserService.extract();
          return [
            `URL: ${result.url}`,
            `Title: ${result.title}`,
            '',
            '## Page Content',
            result.markdown || result.text.slice(0, 5000),
            '',
            `## Links (${result.links.length})`,
            result.links.slice(0, 20).map(l => `  • [${l.text}](${l.href})`).join('\n'),
          ].join('\n');
        }

        case 'click': {
          const selector = args.selector as string;
          if (!selector) return 'click requires a selector argument (CSS selector or text content)';
          const result = await BrowserService.click(selector);
          if (result.success) {
            await new Promise(r => setTimeout(r, 800));
          }
          return result.message;
        }

        case 'fill': {
          const selector = args.selector as string;
          const value = args.value as string;
          if (!selector || value === undefined) return 'fill requires selector and value arguments';
          const result = await BrowserService.fill(selector, value);
          return result.message;
        }

        case 'submit': {
          const selector = args.selector as string | undefined;
          const result = await BrowserService.submit(selector);
          if (result.success) {
            await new Promise(r => setTimeout(r, 1000));
          }
          return result.message;
        }

        case 'scroll': {
          const direction = (args.direction as 'down' | 'up' | 'bottom' | 'top') || 'down';
          const amount = (args.amount as number) || 600;
          await BrowserService.scroll(direction, amount);
          return `Scrolled ${direction}`;
        }

        case 'back': {
          BrowserService.back();
          await new Promise(r => setTimeout(r, 800));
          return `Went back. Current URL: ${BrowserService.url}`;
        }

        case 'forward': {
          BrowserService.forward();
          await new Promise(r => setTimeout(r, 800));
          return `Went forward. Current URL: ${BrowserService.url}`;
        }

        case 'reload': {
          BrowserService.reload();
          await new Promise(r => setTimeout(r, 1000));
          return 'Page reloaded';
        }

        case 'info': {
          const info = await BrowserService.getPageInfo();
          return [
            `URL: ${info.url}`,
            `Title: ${info.title}`,
            `Loading: ${info.loading}`,
            '',
            info.inputs.length > 0
              ? `## Inputs (${info.inputs.length})\n${info.inputs.map(i => `  • [${i.type}] name="${i.name}" placeholder="${i.placeholder}"`).join('\n')}`
              : '## Inputs: none',
            '',
            `## Links (${info.links.length})`,
            info.links.slice(0, 15).map(l => `  • ${l.text} → ${l.href}`).join('\n'),
            '',
            `## Content preview\n${info.content.slice(0, 800)}`,
          ].join('\n');
        }

        case 'wait': {
          const selector = args.selector as string;
          if (!selector) return 'wait requires a selector argument';
          const timeoutMs = (args.timeout as number) || 5000;
          const found = await BrowserService.waitForElement(selector, timeoutMs);
          return found ? `Element found: ${selector}` : `Element not found after ${timeoutMs}ms: ${selector}`;
        }

        default:
          return [
            `Unknown browser operation: "${op}"`,
            'Available: navigate, search, read, click, fill, submit, scroll, back, forward, reload, info, wait',
          ].join('\n');
      }
    } catch (err: any) {
      return `Browser error (${op}): ${err.message}`;
    }
  },
};
