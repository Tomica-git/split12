import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

test('M0 拡張機能を読み込みサービスワーカーを起動できる', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'split8-m0-'));
  const dist = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    // Playwright's retain-on-failure tracing already covers this context.
    const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    expect(sw.url()).toMatch(/^chrome-extension:\/\//);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
