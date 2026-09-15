import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const targets = ['bun-darwin-aarch64', 'bun-darwin-x64', 'bun-linux-x64', 'bun-linux-aarch64', 'bun-windows-x64'];

test('configured compile runtimes never fall back to Bun downloads', { skip: process.platform === 'win32' }, (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-build-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'packages/audit-core');
  mkdirSync(path.join(pkg, 'scripts'), { recursive: true });
  copyFileSync(new URL('../scripts/build-cli.mjs', import.meta.url), path.join(pkg, 'scripts/build-cli.mjs'));
  writeFileSync(path.join(pkg, 'package.json'), '{"version":"0.1.0"}');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const calls = path.join(root, 'calls');
  writeFileSync(path.join(bin, 'bun'), `#!${process.execPath}
const fs = require('node:fs');
if (process.argv[2] === '--version') { console.log('1.3.11'); process.exit(0); }
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
fs.writeFileSync(args.find(arg => arg.startsWith('--outfile=')).slice(10), 'fixture binary');
`, { mode: 0o755 });
  const runtimes = path.join(root, 'runtimes');
  // Only the POSIX fixture executable is reachable, never an installed Bun.
  const env = { PATH: bin, CALLS: calls, BUN_COMPILE_EXECUTABLES_DIR: runtimes };
  const run = (args = [], environment = env) => spawnSync(process.execPath, [path.join(pkg, 'scripts/build-cli.mjs'), ...args], { env: environment, encoding: 'utf8' });

  const missing = run(['darwin-arm64']);
  assert.notEqual(missing.status, 0, 'a missing prefetched runtime must stop before bun build');
  assert.match(missing.stderr, /Missing local Bun compile runtime/);
  assert.throws(() => readFileSync(calls), { code: 'ENOENT' });

  for (const target of targets) {
    const dir = path.join(runtimes, target, 'bin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, target.includes('windows') ? 'bun.exe' : 'bun'), 'prefetched runtime');
  }
  const present = run();
  assert.equal(present.status, 0, present.stderr);
  const builds = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(builds.length, targets.length);
  for (const [index, args] of builds.entries()) {
    const executable = targets[index].includes('windows') ? 'bun.exe' : 'bun';
    assert.ok(args.includes(`--compile-executable-path=${path.join(runtimes, targets[index], 'bin', executable)}`));
  }
  // Local development without a prefetch directory keeps its existing behavior.
  const local = run(['linux-x64'], { PATH: env.PATH, CALLS: calls });
  assert.equal(local.status, 0, local.stderr);
  assert.ok(!JSON.parse(readFileSync(calls, 'utf8').trim().split('\n').at(-1)).some(arg => arg.startsWith('--compile-executable-path=')));
});
