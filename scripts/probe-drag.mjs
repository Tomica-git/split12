import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const server = spawn(process.execPath, ['e2e/fixtures/server.mjs'], { stdio: 'ignore' });
const results = { direct: [], gradual: [] };
try {
  await new Promise(resolve => setTimeout(resolve, 500));
  if (server.exitCode !== null || server.signalCode !== null) throw new Error('Fixture server failed to start');
  for (let attempt = 0; attempt < 24; attempt++) {
    const mode = attempt % 2 ? 'gradual' : 'direct';
    const profile = await mkdtemp(join(tmpdir(), 'split8-drag-'));
    let context, page, link;
    try {
      const dist = resolve('dist');
      context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'] });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      page = await context.newPage();
      await page.goto(`chrome-extension://${new URL(worker.url()).host}/split.html`);
      const address = page.locator('.pane[data-index="0"] input.address');
      await address.fill('http://a.test:4178/link'); await address.press('Enter');
      link = page.frameLocator('.pane[data-index="0"] iframe').getByTestId('link');
      await link.waitFor();
      await page.evaluate(() => {
        window.__dragProbe = [];
        for (const type of ['pointerdown', 'dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) document.addEventListener(type, e => window.__dragProbe.push(`${type}:${e.target?.nodeName}`), true);
      });
      await link.evaluate(() => {
        window.__dragProbe = [];
        for (const type of ['pointerdown', 'dragstart', 'dragend']) document.addEventListener(type, e => window.__dragProbe.push(`${type}:${e.target?.nodeName}`), true);
      });
      const source = await link.boundingBox(), target = await page.locator('.pane[data-index="1"] .pane-view').boundingBox();
      if (mode === 'gradual') {
        const frame = await page.locator('.pane[data-index="0"] iframe').boundingBox();
        await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 20 });
      }
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2);
      await page.mouse.up();
      await page.frameLocator('.pane[data-index="1"] iframe').getByTestId('marker').waitFor({ timeout: 1500 });
      results[mode].push('pass');
    } catch (error) {
      results[mode].push('fail');
      const parent = await page?.evaluate(() => window.__dragProbe).catch(() => []);
      const child = await link?.evaluate(() => window.__dragProbe).catch(() => []);
      process.stdout.write(`failure events: ${JSON.stringify({ parent, child })}\n`);
    } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
    process.stdout.write(`${mode}: ${results[mode].at(-1)}\n`);
  }
} finally { server.kill(); }
process.stdout.write(JSON.stringify(results) + '\n');
