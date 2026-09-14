import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('importing cli.ts does not start a server or run setup/uninstall', async () => {
  // Importing must be side-effect free, the same invariant server.ts already
  // holds (see CLAUDE.md Gotchas: "Importing server.ts does not start a
  // server"). If this import ever triggers main()/runSetup()/runUninstall(),
  // this test hangs instead of failing, same as the existing server.ts guard.
  await import('./cli.ts');
  assert.ok(true);
});

test('unknown subcommand exits with status 1 and prints usage', () => {
  assert.throws(() => {
    execFileSync('node', ['src/cli.ts', 'bogus'], { stdio: 'pipe' });
  }, (error: any) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /Unknown command/);
    return true;
  });
});
