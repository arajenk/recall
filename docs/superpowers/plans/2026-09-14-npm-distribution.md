# npm Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Recall as an npm package (`recall-vault`) with a `setup`/`uninstall` command pair that writes and removes Claude Desktop's MCP config automatically, so a stranger can install it with `npx recall-vault setup` instead of hand-editing JSON.

**Architecture:** A new thin `src/cli.ts` becomes the package's bin, dispatching on `process.argv[2]` to either start the existing MCP server (`server.ts`'s `main`, unchanged, now exported), run `src/setup.ts`'s `runSetup()`, or run `src/uninstall.ts`'s `runUninstall()`. Both `setup.ts` and `uninstall.ts` are built as small pure functions (path detection, plausibility check, config merge/removal) wrapped by a thin orchestrator, so everything except the real `npm install -g` call and OS-reported paths is unit testable without touching a real Claude Desktop install.

**Tech Stack:** Node.js >=24 native TypeScript stripping (no build step), `node:test` + `node:assert/strict`, `node:child_process` (`execSync`) for the global install step, `node:fs/promises` for config read/write/backup.

**Spec:** docs/specs/2026-09-14-npm-distribution-design.md

## Global Constraints

- Package name: `recall-vault`. The tool's own identity, vault folder name, and note format stay "Recall" — only the npm package name changes.
- `server.ts` does not change its behavior; `cli.ts` is routing only.
- No em dashes in any user-facing string (tool descriptions, CLI output, docs) — project-wide rule from CLAUDE.md.
- macOS config path (`~/Library/Application Support/Claude/claude_desktop_config.json`) is the only one considered verified; Windows (`%APPDATA%\Claude\claude_desktop_config.json`) and Linux (`~/.config/Claude/claude_desktop_config.json`) are convention-based and must print an explicit "untested, please report issues" line after a successful write.
- Plausibility check (parent directory of the guessed config path must exist) runs on Windows and Linux only, never macOS, and gates whether setup/uninstall touch the config file at all — a failing check aborts config read/write and falls back to printing the manual JSON block (setup) or a "nothing changed" message (uninstall).
- Every config write is preceded by a timestamped backup of the existing file (`<path>.bak-<timestamp>`), skipped only when there is no existing file to back up.
- Setup must be idempotent: re-running it replaces an existing `mcpServers.recall-vault` entry in place, never duplicates it.
- Uninstall removes only the `recall-vault` key from `mcpServers`, leaving every other entry untouched, and never bundles the `npm uninstall -g` step silently.
- The real `npm install -g recall-vault` call and resolving its installed bin path are the one deliberately untested seam, isolated in their own function.
- Node engines floor stays `>=24` (unchanged from current `package.json`).

---

## File Structure

- **Modify `src/server.ts`**: add `export` to the existing `main` function (currently unexported), no other change. The `import.meta.main` guard stays exactly as is.
- **Create `src/cli.ts`**: the new `bin.recall-vault` entry point. Dispatches on `process.argv[2]`: no argument runs `main()` from `server.ts`; `setup` runs `runSetup()`; `uninstall` runs `runUninstall()`; anything else prints usage and exits 1. Guarded by `import.meta.main`, same pattern as `server.ts`.
- **Create `src/setup.ts`**: `getConfigPath`, `isConfigPathPlausible`, `readConfig`, `backupConfig`, `mergeRecallEntry`, `manualConfigBlock`, `installGlobally` (the untested seam), and the orchestrator `runSetup`.
- **Create `src/setup.test.ts`**: covers every function above except `installGlobally` and `runSetup` itself (both call the real `npm` binary).
- **Create `src/uninstall.ts`**: reuses `getConfigPath`, `isConfigPathPlausible`, `readConfig`, `backupConfig` from `setup.ts`; adds `removeRecallEntry` and the orchestrator `runUninstall`.
- **Create `src/uninstall.test.ts`**: covers `removeRecallEntry` and the read/backup/write flow, mirroring `setup.test.ts`.
- **Modify `package.json`**: rename to `recall-vault`, change `bin` to `{"recall-vault": "src/cli.ts"}`, add `repository`, `homepage`, `bugs`, `keywords`, `files` allowlist.
- **Modify `README.md`**: rewrite the Setup section around `npx recall-vault setup` / `npx recall-vault uninstall`, keep a from-source section for contributors.

## Interfaces (shared across tasks)

```ts
// src/setup.ts
export interface ServerEntry {
  command: string;
  args: string[];
}
export interface ClaudeConfig {
  mcpServers?: Record<string, ServerEntry>;
  [key: string]: unknown;
}

export function getConfigPath(platform?: NodeJS.Platform): string
export async function isConfigPathPlausible(configPath: string, platform?: NodeJS.Platform): Promise<boolean>
export async function readConfig(configPath: string): Promise<ClaudeConfig>
export async function backupConfig(configPath: string): Promise<void>
export function mergeRecallEntry(config: ClaudeConfig, binPath: string): ClaudeConfig
export function manualConfigBlock(binPath: string): string
export async function installGlobally(): Promise<string>
export async function runSetup(): Promise<void>

// src/uninstall.ts
export function removeRecallEntry(config: ClaudeConfig): ClaudeConfig
export async function runUninstall(): Promise<void>

// src/server.ts (existing, changed to exported)
export async function main(): Promise<void>
```

---

### Task 1: Export `main` from `server.ts` and add `src/cli.ts`

**Files:**
- Modify: `src/server.ts` (the `async function main()` declaration)
- Create: `src/cli.ts`
- Test: `src/cli.test.ts`

**Interfaces:**
- Consumes: `main` from `./server.ts`; `runSetup` from `./setup.ts` and `runUninstall` from `./uninstall.ts`. Neither file exists yet, so this task creates minimal placeholder versions of both (see Step 2) purely so `cli.ts` has something real to import; Tasks 2-4 replace those placeholder bodies with the actual implementations without changing their exported names or signatures.
- Produces: `cli.ts`'s dispatch logic, importable and testable without starting a real server (mirrors the `import.meta.main` guard test pattern already used for `server.ts`, documented in CLAUDE.md's Gotchas section).

- [ ] **Step 1: Export `main` in `server.ts`**

Find the existing declaration:

```ts
async function main(): Promise<void> {
```

Change to:

```ts
export async function main(): Promise<void> {
```

Leave everything else in `server.ts`, including the `import.meta.main` guard below it, untouched.

- [ ] **Step 2: Create placeholder `src/setup.ts` and `src/uninstall.ts`**

`src/setup.ts`:

```ts
export async function runSetup(): Promise<void> {
  console.log('setup not yet implemented');
}
```

`src/uninstall.ts`:

```ts
export async function runUninstall(): Promise<void> {
  console.log('uninstall not yet implemented');
}
```

These are placeholders. Tasks 2 and 4 replace them with the real implementations, functions and all.

- [ ] **Step 3: Write the failing test for `cli.ts`**

Create `src/cli.test.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test src/cli.test.ts`
Expected: FAIL, `src/cli.ts` does not exist yet (`Cannot find module`).

- [ ] **Step 5: Write `src/cli.ts`**

```ts
import { main } from './server.ts';
import { runSetup } from './setup.ts';
import { runUninstall } from './uninstall.ts';

async function run(): Promise<void> {
  const command = process.argv[2];

  if (command === undefined) {
    await main();
  } else if (command === 'setup') {
    await runSetup();
  } else if (command === 'uninstall') {
    await runUninstall();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: recall-vault [setup|uninstall]');
    process.exit(1);
  }
}

// Only when run directly, same guard server.ts uses so importing this file
// for tests never starts the server or runs setup/uninstall as a side effect.
if (import.meta.main) {
  run().catch((error) => {
    console.error('recall-vault failed:', error);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test src/cli.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/cli.ts src/cli.test.ts src/setup.ts src/uninstall.ts
git commit -m "Add recall-vault CLI dispatcher with setup/uninstall stubs"
```

---

### Task 2: `setup.ts` pure functions (config path, plausibility, merge)

**Files:**
- Modify: `src/setup.ts` (replace the Task 1 placeholder)
- Test: `src/setup.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ClaudeConfig`, `ServerEntry`, `getConfigPath(platform?)`, `isConfigPathPlausible(configPath, platform?)`, `mergeRecallEntry(config, binPath)` — all consumed by Task 3's orchestrator and by `uninstall.ts` in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/setup.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  getConfigPath,
  isConfigPathPlausible,
  mergeRecallEntry,
  type ClaudeConfig,
} from './setup.ts';

test('getConfigPath resolves the macOS path', () => {
  const result = getConfigPath('darwin');
  assert.ok(result.endsWith(path.join('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')));
});

test('getConfigPath resolves the Windows path under APPDATA', () => {
  const originalAppData = process.env.APPDATA;
  process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
  try {
    const result = getConfigPath('win32');
    assert.equal(result, path.join('C:\\Users\\test\\AppData\\Roaming', 'Claude', 'claude_desktop_config.json'));
  } finally {
    if (originalAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppData;
  }
});

test('getConfigPath resolves the Linux path under ~/.config', () => {
  const result = getConfigPath('linux');
  assert.ok(result.endsWith(path.join('.config', 'Claude', 'claude_desktop_config.json')));
});

test('isConfigPathPlausible is always true on darwin, even for a nonexistent path', async () => {
  const result = await isConfigPathPlausible('/definitely/not/a/real/path/claude_desktop_config.json', 'darwin');
  assert.equal(result, true);
});

test('isConfigPathPlausible is false on linux/win32 when the parent directory is missing', async () => {
  const result = await isConfigPathPlausible('/definitely/not/a/real/path/claude_desktop_config.json', 'linux');
  assert.equal(result, false);
});

test('isConfigPathPlausible is true on linux/win32 when the parent directory exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  const result = await isConfigPathPlausible(configPath, 'linux');
  assert.equal(result, true);
});

test('mergeRecallEntry adds a recall-vault entry to an empty config', () => {
  const config: ClaudeConfig = { mcpServers: {} };
  const result = mergeRecallEntry(config, '/usr/local/bin/recall-vault');
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/usr/local/bin/recall-vault',
    args: [],
  });
});

test('mergeRecallEntry preserves other server entries', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'some-other-server': { command: '/bin/other', args: ['--flag'] },
    },
  };
  const result = mergeRecallEntry(config, '/usr/local/bin/recall-vault');
  assert.deepEqual(result.mcpServers?.['some-other-server'], {
    command: '/bin/other',
    args: ['--flag'],
  });
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/usr/local/bin/recall-vault',
    args: [],
  });
});

test('mergeRecallEntry is idempotent: re-running replaces the entry in place', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'recall-vault': { command: '/old/stale/path', args: [] },
      'some-other-server': { command: '/bin/other', args: [] },
    },
  };
  const result = mergeRecallEntry(config, '/new/bin/path');
  const keys = Object.keys(result.mcpServers ?? {});
  assert.equal(keys.filter((key) => key === 'recall-vault').length, 1);
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/new/bin/path',
    args: [],
  });
  assert.deepEqual(result.mcpServers?.['some-other-server'], {
    command: '/bin/other',
    args: [],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/setup.test.ts`
Expected: FAIL, `getConfigPath`/`isConfigPathPlausible`/`mergeRecallEntry` are not exported (the placeholder from Task 1 only exports `runSetup`).

- [ ] **Step 3: Replace `src/setup.ts` with the real path/plausibility/merge logic**

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ServerEntry {
  command: string;
  args: string[];
}

export interface ClaudeConfig {
  mcpServers?: Record<string, ServerEntry>;
  [key: string]: unknown;
}

/**
 * Where Claude Desktop's own config lives. macOS is the one path this has
 * actually been tested against; Windows and Linux are written from known
 * convention and gated behind isConfigPathPlausible before anything trusts
 * them.
 */
export function getConfigPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

/**
 * A missing parent directory on Windows or Linux means the guessed path is
 * probably wrong for this machine, not that Claude Desktop needs a fresh
 * directory created for it. Skipped on macOS, where the path is already
 * confirmed real.
 */
export async function isConfigPathPlausible(
  configPath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (platform === 'darwin') return true;

  try {
    const stat = await fs.stat(path.dirname(configPath));
    return stat.isDirectory();
  } catch {
    return false;
  }
}
```

We will append `readConfig`, `backupConfig`, `manualConfigBlock`, `mergeRecallEntry`, `installGlobally`, and `runSetup` to this same file in Task 3; for this step, add `mergeRecallEntry` now since Task 2's tests need it:

```ts
/**
 * Assignment by key, so re-running setup is idempotent: an existing
 * recall-vault entry is replaced in place, never duplicated.
 */
export function mergeRecallEntry(config: ClaudeConfig, binPath: string): ClaudeConfig {
  return {
    ...config,
    mcpServers: {
      ...(config.mcpServers ?? {}),
      'recall-vault': { command: binPath, args: [] },
    },
  };
}
```

Note: `runSetup` from the Task 1 placeholder must stay exported (even as a stub logging "not yet implemented") so `cli.ts` keeps importing successfully; Task 3 replaces its body with the real orchestrator.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/setup.test.ts`
Expected: PASS, all seven tests green.

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts src/setup.test.ts
git commit -m "Add config path detection, plausibility check, and idempotent merge to setup.ts"
```

---

### Task 3: `setup.ts` orchestrator (`readConfig`, `backupConfig`, `manualConfigBlock`, `installGlobally`, `runSetup`)

**Files:**
- Modify: `src/setup.ts` (append the remaining functions, replace the placeholder `runSetup`)
- Modify: `src/setup.test.ts` (add tests for `readConfig`, `backupConfig`, `manualConfigBlock`)

**Interfaces:**
- Consumes: `ClaudeConfig`, `getConfigPath`, `isConfigPathPlausible`, `mergeRecallEntry` from Task 2 (same file).
- Produces: `readConfig(configPath): Promise<ClaudeConfig>`, `backupConfig(configPath): Promise<void>`, `manualConfigBlock(binPath): string`, `installGlobally(): Promise<string>`, `runSetup(): Promise<void>` — consumed by `cli.ts` (already wired in Task 1) and, for `readConfig`/`backupConfig`/`ClaudeConfig`, by `uninstall.ts` in Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/setup.test.ts`:

```ts
import { readConfig, backupConfig, manualConfigBlock } from './setup.ts';

test('readConfig returns an empty mcpServers object when the file does not exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  const result = await readConfig(configPath);
  assert.deepEqual(result, { mcpServers: {} });
});

test('readConfig parses an existing valid config file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, JSON.stringify({ mcpServers: { foo: { command: 'bar', args: [] } } }));
  const result = await readConfig(configPath);
  assert.deepEqual(result, { mcpServers: { foo: { command: 'bar', args: [] } } });
});

test('readConfig throws on a file that is not valid JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, '{ not valid json');
  await assert.rejects(() => readConfig(configPath));
});

test('backupConfig copies an existing file to a timestamped .bak path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, '{"mcpServers":{}}');

  await backupConfig(configPath);

  const entries = await fs.readdir(root);
  const backups = entries.filter((name) => name.startsWith('claude_desktop_config.json.bak-'));
  assert.equal(backups.length, 1);
  const backupContent = await fs.readFile(path.join(root, backups[0]), 'utf8');
  assert.equal(backupContent, '{"mcpServers":{}}');
});

test('backupConfig does nothing when there is no existing file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');

  await backupConfig(configPath); // must not throw

  const entries = await fs.readdir(root);
  assert.deepEqual(entries, []);
});

test('manualConfigBlock prints valid JSON containing the given bin path', () => {
  const block = manualConfigBlock('/usr/local/bin/recall-vault');
  const parsed = JSON.parse(block);
  assert.deepEqual(parsed, {
    mcpServers: {
      'recall-vault': { command: '/usr/local/bin/recall-vault', args: [] },
    },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/setup.test.ts`
Expected: FAIL, `readConfig`/`backupConfig`/`manualConfigBlock` are not exported yet.

- [ ] **Step 3: Append the real implementations to `src/setup.ts`**

```ts
import { execSync } from 'node:child_process';

/**
 * A missing file starts a fresh config from scratch. A file that fails to
 * parse as JSON is surfaced to the caller, which treats it the same as a
 * bad path: abort, write nothing, fall back to the manual JSON block.
 */
export async function readConfig(configPath: string): Promise<ClaudeConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { mcpServers: {} };
    }
    throw error;
  }
  return JSON.parse(raw);
}

/** Backs up the existing config before any write touches it. A no-op if there is nothing to back up yet. */
export async function backupConfig(configPath: string): Promise<void> {
  try {
    await fs.access(configPath);
  } catch {
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(configPath, `${configPath}.bak-${timestamp}`);
}

/** The block a user pastes in by hand when setup could not write the config itself. */
export function manualConfigBlock(binPath: string): string {
  return JSON.stringify(
    { mcpServers: { 'recall-vault': { command: binPath, args: [] } } },
    null,
    2,
  );
}

/**
 * The one step that is not meaningfully unit testable: it shells out to the
 * real npm and the real global bin directory. Isolated here so it is the
 * only untested seam, not papered over.
 */
export async function installGlobally(): Promise<string> {
  execSync('npm install -g recall-vault', { stdio: 'inherit' });
  const whichCommand = process.platform === 'win32' ? 'where recall-vault' : 'which recall-vault';
  return execSync(whichCommand).toString().trim().split('\n')[0];
}

function printManualFallback(binPath: string, reason: string): void {
  console.log(reason);
  console.log('Add this to your claude_desktop_config.json by hand:\n');
  console.log(manualConfigBlock(binPath));
}

export async function runSetup(): Promise<void> {
  const platform = process.platform;
  const configPath = getConfigPath(platform);
  const plausible = await isConfigPathPlausible(configPath, platform);
  const binPath = await installGlobally();

  if (!plausible) {
    printManualFallback(
      binPath,
      "Could not find Claude Desktop's config directory at the expected location for this platform.",
    );
    return;
  }

  let config: ClaudeConfig;
  try {
    config = await readConfig(configPath);
  } catch {
    printManualFallback(binPath, 'Could not parse the existing config file as JSON.');
    return;
  }

  await backupConfig(configPath);
  const updated = mergeRecallEntry(config, binPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  console.log('Recall is now configured in Claude Desktop. Restart Claude Desktop to pick it up.');
  if (platform !== 'darwin') {
    console.log(
      `This config path (${configPath}) is untested on ${platform}. If it did not work, please open an issue.`,
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/setup.test.ts`
Expected: PASS, all tests green (13 total across Tasks 2 and 3).

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts src/setup.test.ts
git commit -m "Add readConfig, backupConfig, manualConfigBlock, and the runSetup orchestrator"
```

---

### Task 4: `uninstall.ts`

**Files:**
- Modify: `src/uninstall.ts` (replace the Task 1 placeholder)
- Create: `src/uninstall.test.ts`

**Interfaces:**
- Consumes: `ClaudeConfig`, `getConfigPath`, `isConfigPathPlausible`, `readConfig`, `backupConfig` from `./setup.ts` (Tasks 2-3).
- Produces: `removeRecallEntry(config): ClaudeConfig`, `runUninstall(): Promise<void>` — consumed by `cli.ts` (already wired in Task 1).

- [ ] **Step 1: Write the failing tests**

Create `src/uninstall.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { removeRecallEntry } from './uninstall.ts';
import type { ClaudeConfig } from './setup.ts';

test('removeRecallEntry removes only the recall-vault key', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'recall-vault': { command: '/usr/local/bin/recall-vault', args: [] },
      'some-other-server': { command: '/bin/other', args: ['--flag'] },
    },
  };
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {
    'some-other-server': { command: '/bin/other', args: ['--flag'] },
  });
});

test('removeRecallEntry is a no-op when recall-vault is not present', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'some-other-server': { command: '/bin/other', args: [] },
    },
  };
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {
    'some-other-server': { command: '/bin/other', args: [] },
  });
});

test('removeRecallEntry handles a config with no mcpServers at all', () => {
  const config: ClaudeConfig = {};
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {});
});
```

Note: no filesystem test of `runUninstall` itself is needed beyond what `setup.test.ts` already covers for `readConfig`/`backupConfig`/`isConfigPathPlausible`, since `runUninstall` composes those same functions; `removeRecallEntry` is the only new pure function this task introduces.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/uninstall.test.ts`
Expected: FAIL, `removeRecallEntry` is not exported yet (the placeholder from Task 1 only exports `runUninstall`).

- [ ] **Step 3: Replace `src/uninstall.ts` with the real implementation**

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getConfigPath, isConfigPathPlausible, readConfig, backupConfig, type ClaudeConfig } from './setup.ts';

/** Removes only the recall-vault entry, leaving every other server the user has configured untouched. */
export function removeRecallEntry(config: ClaudeConfig): ClaudeConfig {
  const mcpServers = { ...(config.mcpServers ?? {}) };
  delete mcpServers['recall-vault'];
  return { ...config, mcpServers };
}

export async function runUninstall(): Promise<void> {
  const platform = process.platform;
  const configPath = getConfigPath(platform);
  const plausible = await isConfigPathPlausible(configPath, platform);

  if (!plausible) {
    console.log(
      "Could not find Claude Desktop's config directory at the expected location for this platform. Nothing was changed.",
    );
    return;
  }

  let config: ClaudeConfig;
  try {
    config = await readConfig(configPath);
  } catch {
    console.log('Could not parse the existing config file as JSON. Nothing was changed.');
    return;
  }

  await backupConfig(configPath);
  const updated = removeRecallEntry(config);
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  const vaultRoot = process.env.RECALL_VAULT ?? path.join(os.homedir(), 'Recall');
  console.log("Removed recall-vault from Claude Desktop's config. Restart Claude Desktop to pick it up.");
  console.log(`Your notes in ${vaultRoot} were left alone.`);
  console.log('To remove the recall-vault command itself, run: npm uninstall -g recall-vault');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/uninstall.test.ts`
Expected: PASS, all three tests green.

- [ ] **Step 5: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS, every existing test (`server.test.ts`, `notes.test.ts`, `vault.test.ts`, `search.test.ts`, `prompt.test.ts`) plus the new `cli.test.ts`, `setup.test.ts`, `uninstall.test.ts` all green.

- [ ] **Step 6: Commit**

```bash
git add src/uninstall.ts src/uninstall.test.ts
git commit -m "Add runUninstall and removeRecallEntry"
```

---

### Task 5: `package.json` metadata

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing (pure metadata change).
- Produces: the published package shape later tasks and `npm publish` rely on.

- [ ] **Step 1: Confirm the repo's GitHub remote**

Run: `git remote get-url origin`
Expected output: `git@github.com:arajenk/recall.git` (already confirmed earlier in this project; used below to fill `repository`/`homepage`/`bugs`).

- [ ] **Step 2: Rewrite `package.json`**

Replace the full file with:

```json
{
  "name": "recall-vault",
  "version": "0.1.0",
  "description": "Turns AI conversations into organized local markdown memory",
  "license": "MIT",
  "type": "module",
  "bin": {
    "recall-vault": "src/cli.ts"
  },
  "scripts": {
    "test": "node --test \"src/**/*.test.ts\"",
    "start": "node src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "engines": {
    "node": ">=24"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/arajenk/recall.git"
  },
  "homepage": "https://github.com/arajenk/recall#readme",
  "bugs": {
    "url": "https://github.com/arajenk/recall/issues"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "claude",
    "claude-desktop",
    "memory",
    "notes",
    "markdown"
  ],
  "files": [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "prompts/**"
  ]
}
```

Note: `bin.recall` is removed entirely, replaced by `bin.recall-vault` pointing at the new `src/cli.ts`. `start` keeps pointing at `src/server.ts` directly since that script is for local development (piping raw JSON-RPC at the server, per CLAUDE.md), not the published CLI entry point.

- [ ] **Step 3: Verify the package still runs locally**

Run: `node src/cli.ts setup 2>&1 | head -5`
Expected: starts running `runSetup()` (it will attempt a real `npm install -g recall-vault`, which is expected to fail since the package is not yet published; confirm it fails with an `npm` error rather than a Node import error, proving the dispatch wiring is correct). This is a manual smoke check, not an automated test, consistent with `installGlobally` being the deliberately untested seam.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, unaffected by a metadata-only change.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "Rename package to recall-vault and add publish metadata"
```

---

### Task 6: README rewrite

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Replace the "Setup" section (`README.md` lines 25-51)**

Replace:

```markdown
## Setup

### Requirements

- Node.js 24+
- Claude Desktop
- macOS (currently the only platform I've tested)

Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd recall
npm install
```

Run the server:

```bash
npm start
```

Then add Recall to your Claude Desktop MCP config and restart Claude Desktop.

Once it's connected, `save-memory` should show up in the prompt picker under `recall`.

By default, notes are saved to `~/Recall`. You can change this with the `RECALL_VAULT` environment variable.
```

With:

```markdown
## Setup

### Requirements

- Node.js 24+
- Claude Desktop
- npm

Run:

```bash
npx recall-vault setup
```

This installs `recall-vault` globally, finds Claude Desktop's config file, and adds Recall
to it. If it can't find or read that file, it prints the config block for you to paste in
by hand instead of guessing wrong. Restart Claude Desktop afterward.

Once it's connected, `save-memory` should show up in the prompt picker under `recall-vault`.

By default, notes are saved to `~/Recall`. You can change this with the `RECALL_VAULT`
environment variable before running setup.

This has been tested on macOS. Setup also writes a config on Windows and Linux from known
convention, but that path is untested; if it doesn't work, please open an issue.

### Removing it

```bash
npx recall-vault uninstall
```

This removes Recall from Claude Desktop's config, leaving every other MCP server you have
configured untouched and leaving your notes exactly where they are. To also remove the
`recall-vault` command itself, run `npm uninstall -g recall-vault` separately.

### Running from source

If you're contributing or want to run against a local checkout instead of the published
package:

```bash
git clone <repo-url>
cd recall
npm install
npm start
```

Then add the server to Claude Desktop's config by hand, pointing `command` at your local
Node binary and `args` at the absolute path to `src/server.ts` in your checkout, since
Claude Desktop launches without your shell PATH.
```

- [ ] **Step 2: Read the file back to confirm the replacement landed correctly**

Run: `sed -n '1,80p' README.md`
Expected: the new Setup/Removing it/Running from source sections appear in place of the old Setup section, with the rest of the file (How it works, Reading notes back, Using it, etc.) unchanged.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Rewrite README setup around npx recall-vault setup/uninstall"
```

---

### Task 7: Final personal-traces scan before publish readiness

**Files:**
- None modified unless the scan finds something; this task is a verification pass.

**Interfaces:**
- Consumes: nothing.
- Produces: a go/no-go signal for `npm publish`, which stays a manual, separately-confirmed step per the spec's Out of Scope section, not part of this plan's automated work.

- [ ] **Step 1: Search tracked files for personal identifiers**

Run:

```bash
git grep -niE "arajen|kajanthira|tfsa|doordash|birthday money" -- . ':!docs/specs' ':!node_modules'
```

Expected: only the `LICENSE` file's copyright line (`Copyright (c) 2026 Arajen Kajanthirabalan`) matches, which is expected and correct for an MIT license, not a leak.

- [ ] **Step 2: Search for other likely personal-data shapes**

Run:

```bash
git grep -niE "\.md\"[^\"]*credit card|social security|api[_-]?key.{0,20}=.{0,20}[a-zA-Z0-9]{20}" -- . ':!node_modules'
```

Expected: no matches.

- [ ] **Step 3: Confirm `docs/specs/` stays out of the published package and out of git**

Run: `git check-ignore -v docs/specs/2026-09-14-npm-distribution-design.md`
Expected: prints a match against the `docs/specs/` line in `.gitignore`, confirming this design doc (and any future one) never ships.

Run: `cat package.json | grep -A5 '"files"'`
Expected: the `files` allowlist from Task 5 lists only `src/**/*.ts` (excluding tests) and `prompts/**`, so `docs/`, `CLAUDE.md`, and `AGENTS.md` are never included in the published tarball even though they're tracked in git.

- [ ] **Step 4: Report findings**

If Steps 1-2 find nothing beyond the expected `LICENSE` line, the repo is clear to publish. If they find something, redact it following the same pattern used earlier for the CLAUDE.md financial example (generic replacement, commit, and consider whether a `git filter-repo` history rewrite is warranted, the same judgment call already made once in this project). No commit is expected from this task unless the scan turns something up.
