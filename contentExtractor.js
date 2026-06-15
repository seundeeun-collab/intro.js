import { browse, closeBrowser } from './webClient.js';

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

export async function extractFromPage(url, opts = {}) {
  const { executablePath, headless = true, args = [], timeout = 30000 } = opts;
  const { browser, page } = await browse(url, { executablePath, headless, args, timeout });
  try {
    // visible text
    const visibleText = await page.evaluate(() => document.body ? document.body.innerText : '');

    // full HTML
    const fullHTML = await page.evaluate(() => document.documentElement.outerHTML);

    // collect inline script/text contents and external script hrefs
    const scripts = await page.evaluate(() => {
      return Array.from(document.scripts || []).map(s => ({ src: s.src || null, text: s.src ? null : s.textContent }));
    });

    // collect style tags and linked stylesheets
    const styles = await page.evaluate(() => {
      const inline = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '');
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href || '');
      return { inline, links };
    });

    // meta tags (title, description)
    const meta = await page.evaluate(() => {
      const title = document.title || '';
      const desc = (document.querySelector('meta[name="description"]') || {}).content || '';
      return { title, description: desc };
    });

    // sections: headings and their following paragraph content
    const sections = await page.evaluate(() => {
      const headingSel = 'h1,h2,h3,h4,h5,h6';
      const nodes = Array.from(document.querySelectorAll(headingSel));
      const result = [];
      if (!nodes.length) {
        // fallback: take body text as a single section
        return [{ heading: '', text: document.body ? document.body.innerText : '' }];
      }
      for (let i = 0; i < nodes.length; i++) {
        const h = nodes[i];
        let text = '';
        let el = h.nextElementSibling;
        while (el && !el.matches(headingSel)) {
          if (el.innerText) text += '\n\n' + el.innerText;
          el = el.nextElementSibling;
        }
        result.push({ heading: h.innerText || '', text: text.trim() });
      }
      return result;
    });

    // create an AI-friendly payload (concatenate visible text, title, meta, inline scripts/styles)
    const payload = [];
    if (meta.title) payload.push('Title: ' + meta.title);
    if (meta.description) payload.push('Description: ' + meta.description);
    if (visibleText) payload.push('Visible text:\n' + visibleText);
    if (styles.inline && styles.inline.length) payload.push('Inline CSS:\n' + styles.inline.join('\n/*----*/\n'));
    const inlineScripts = scripts.filter(s => s.text).map(s => s.text).filter(Boolean);
    if (inlineScripts.length) payload.push('Inline JS:\n' + inlineScripts.join('\n/*----*/\n'));

    const normalized = normalizeWhitespace(payload.join('\n\n'));

    return {
      url,
      title: meta.title,
      description: meta.description,
      visibleText: normalizeWhitespace(visibleText),
      fullHTML,
      inlineScripts: inlineScripts,
      inlineStyles: styles.inline,
      externalScripts: scripts.filter(s => s.src).map(s => s.src),
      externalStyles: styles.links,
      sections,
      aiPayload: normalized,
    };
  } finally {
    await closeBrowser(browser);
  }
}

export default { extractFromPage };
