import { saveContent, loadContent } from '../contentService.js';
import fs from 'fs/promises';
import path from 'path';

const LOCAL_STORE = path.resolve('content-store');

test('save and load content locally', async () => {
  const key = 'test-page.html';
  const html = '<html><body><h1>Test</h1></body></html>';
  await saveContent(key, html);
  const loaded = await loadContent(key);
  expect(loaded).toContain('Test');
  // cleanup
  const target = path.join(LOCAL_STORE, key.replace(/[^a-z0-9\-_.]/gi, '_'));
  await fs.unlink(target);
});
