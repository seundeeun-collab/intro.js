import { getModelConfig, queryAiModels } from './aiClient.js';
import franc from 'franc';
import langs from 'langs';
import { URL } from 'url';

function detectLanguage(text) {
  try {
    const code = franc(text, { minLength: 20 });
    if (!code || code === 'und') return { code: 'und', name: 'unknown' };
    const info = langs.where('3', code) || langs.where('1', code);
    return { code, name: info ? info.name : code };
  } catch (e) {
    return { code: 'und', name: 'unknown' };
  }
}

function chunkText(text, maxChars = 3000) {
  // Semantic chunking: try to split on double newlines (paragraphs) or headings, preserving boundaries
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length <= maxChars) {
      current = current ? current + '\n\n' + p : p;
    } else {
      if (current) chunks.push(current);
      if (p.length > maxChars) {
        // fallback: split long paragraph into sentence-based pieces
        const sentences = p.match(/[^.!?]+[.!?]?/g) || [p];
        let buf = '';
        for (const s of sentences) {
          if ((buf + s).length <= maxChars) buf += s;
          else {
            if (buf) chunks.push(buf);
            buf = s;
          }
        }
        if (buf) chunks.push(buf);
        current = '';
      } else {
        current = p;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateText(text, opts = {}) {
  // Use an external translation API if provided via opts or env
  const apiUrl = opts.translateApiUrl || process.env.TRANSLATE_API_URL;
  const apiKey = opts.translateApiKey || process.env.TRANSLATE_API_KEY;
  if (!apiUrl) return text;
  try {
    const body = { q: text, source: 'auto', target: 'en' };
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await resp.json();
    // Handle common translation API response shapes
    // LibreTranslate: { translatedText: '...' }
    if (data.translatedText) return data.translatedText;
    // DeepL: { translations: [ { text: '...' } ] }
    if (data.translations && Array.isArray(data.translations) && data.translations[0] && data.translations[0].text) return data.translations[0].text;
    // Google-style: { data: { translations: [ { translatedText: '...' } ] } }
    if (data.data && data.data.translations && data.data.translations[0] && data.data.translations[0].translatedText) return data.data.translations[0].translatedText;
    // Other common keys
    if (data.result) return data.result;
    if (data.translation) return data.translation;
    // Fallback: return original text
    return text;
  } catch (e) {
    return text;
  }
}

export async function summarizeExtraction(extraction, opts = {}) {
  const models = opts.models || getModelConfig();
  const text = extraction.aiPayload || extraction.visibleText || extraction.fullHTML || '';
  const lang = detectLanguage(text);

  const result = { language: lang, chunkSummaries: [], finalSummary: null };

  // build chunks from sections if available (semantic by headings), otherwise from text
  let chunks = [];
  if (extraction && Array.isArray(extraction.sections) && extraction.sections.length) {
    // merge sections into chunk-size groups
    let current = '';
    for (const s of extraction.sections) {
      const sectionText = (s.heading ? s.heading + '\n\n' : '') + (s.text || '');
      if ((current + '\n\n' + sectionText).length <= (opts.chunkSize || 3000)) {
        current = current ? current + '\n\n' + sectionText : sectionText;
      } else {
        if (current) chunks.push(current);
        if (sectionText.length > (opts.chunkSize || 3000)) {
          const sub = chunkText(sectionText, opts.chunkSize || 3000);
          chunks.push(...sub);
          current = '';
        } else {
          current = sectionText;
        }
      }
    }
    if (current) chunks.push(current);
  } else {
    // fallback to chunking raw text
    chunks = chunkText(text, opts.chunkSize || 3000);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const detectedLang = lang && lang.code && lang.code !== 'und' ? `${lang.name} (${lang.code})` : 'unknown';
    const autoTranslate = opts.autoTranslate !== false; // default true
    let inputChunk = chunk;
    if (autoTranslate && lang && lang.code && lang.code !== 'eng' && lang.code !== 'en' && lang.code !== 'und') {
      inputChunk = await translateText(chunk, opts);
    }
    const prompt = `The original content language appears to be: ${detectedLang}. ` +
      `Summarize the following web page content in concise English (3-5 sentences). Content:\n\n${inputChunk}`;
    // retry AI summarization a few times with exponential backoff
    let aiResults = null;
    const maxRetries = opts.maxAiRetries || 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        aiResults = await queryAiModels(models, prompt);
        break;
      } catch (e) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`AI call failed (attempt ${attempt}): ${e}. Retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    if (!aiResults) aiResults = {};
    // pick the first successful model response's text if possible
    let summaryText = null;
    for (const key of Object.keys(aiResults)) {
      if (aiResults[key].status === 'success') {
        const data = aiResults[key].response;
        summaryText = (typeof data === 'string') ? data : (data?.text || JSON.stringify(data));
        break;
      }
    }
    result.chunkSummaries.push({ index: i, summary: summaryText, aiResults });
  }

  // Aggregate chunk summaries
  const aggregated = result.chunkSummaries.map(c => c.summary || '').join('\n\n');
  if (aggregated.trim()) {
    const aggPrompt = `Aggregate and shorten these chunk summaries into a single concise summary (max 5 sentences):\n\n${aggregated}`;
    const aggResults = await queryAiModels(models, aggPrompt);
    for (const key of Object.keys(aggResults)) {
      if (aggResults[key].status === 'success') {
        const data = aggResults[key].response;
        result.finalSummary = (typeof data === 'string') ? data : (data?.text || JSON.stringify(data));
        break;
      }
    }
  }

  return result;
}

export default { detectLanguage, chunkText, summarizeExtraction };
