import { spawn } from 'child_process';
import fs from 'fs/promises';

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

async function runEslintFix() {
  try {
    const res = await runCmd('npx', ['eslint', '.', '--ext', '.js,.mjs', '--fix']);
    return res;
  } catch (e) {
    return { code: 1, out: '', err: String(e) };
  }
}

async function runTests() {
  try {
    const res = await runCmd('npx', ['jest', '--color=false', '--json']);
    return res;
  } catch (e) {
    return { code: 1, out: '', err: String(e) };
  }
}

async function main() {
  const report = { eslint: null, tests: null };
  console.log('Running ESLint --fix...');
  report.eslint = await runEslintFix();
  console.log('ESLint done. Running tests...');
  report.tests = await runTests();
  await fs.writeFile('qa-report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('QA report written to qa-report.json');
  if (report.tests.code !== 0) process.exit(2);
}

main().catch(err => {
  console.error('qa-bot error:', err);
  process.exit(1);
});
