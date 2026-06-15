import { extractFromPage } from './contentExtractor.js';
import { summarizeExtraction } from './aiIntegrator.js';

async function main() {
  const url = process.argv[2] || 'https://example.com';
  try {
    const result = await extractFromPage(url, { headless: true });
    console.log('Title:', result.title);
    console.log('Description:', result.description);
    console.log('\n--- AI Payload (truncated 1000 chars) ---\n');
    console.log(result.aiPayload.slice(0, 1000));

    // Run language detection and summarization via AI integrator
    console.log('\nRunning AI summarization (this will call configured AI endpoints)...');
    const summary = await summarizeExtraction(result, { chunkSize: 3000 });
    console.log('\nFinal Summary:\n', summary.finalSummary);

    // Save full payload to disk if requested
    const fs = await import('fs/promises');
    await fs.writeFile('last-extract.json', JSON.stringify({ extract: result, summary }, null, 2), 'utf8');
    console.log('\nFull extract + summary saved to last-extract.json');
  } catch (err) {
    console.error('Extraction failed:', err);
    process.exit(1);
  }
}

main();
