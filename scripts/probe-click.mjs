import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const server = spawn(process.execPath, ['e2e/fixtures/server.mjs'], { stdio: 'ignore' });
const results = { direct: [], gradual: [], settled: [], layered: [] };
const normalWithExtension = process.argv.includes('--normal-with-extension');
const normal = process.argv.includes('--normal') || normalWithExtension;
const attempts = Number(process.env.SPLIT8_PROBE_ATTEMPTS ?? '16');
const modes = process.argv.includes('--layer') ? ['direct', 'layered'] : process.argv.includes('--settle') ? ['direct', 'gradual', 'settled'] : ['direct', 'gradual'];
try {
  await new Promise(resolve => setTimeout(resolve, 500));
  if (server.exitCode !== null || server.signalCode !== null) throw new Error('Fixture server failed to start; port 4178 may be in use.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    const mode = modes[attempt % modes.length];
    const profile = await mkdtemp(join(tmpdir(), 'split8-probe-'));
    let context, page, link;
    try {
      const dist = resolve('dist');
      const args = ['--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'];
      if (process.env.SPLIT8_PROBE_NO_SITE_ISOLATION === '1') args.push('--disable-site-isolation-trials');
      if (!normal || normalWithExtension) args.push(`--disable-extensions-except=${dist}`, `--load-extension=${dist}`);
      context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args });
      const worker = normal && !normalWithExtension ? undefined : (context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'));
      page = await context.newPage();
      if (normal) await page.goto(`http://a.test:4178/frame?sandbox=1&src=${encodeURIComponent('http://b.test:4178/link')}`);
      else {
        await page.goto(`chrome-extension://${new URL(worker.url()).host}/split.html`);
        const address = page.locator('.pane[data-index="0"] input.address');
        await address.fill('http://a.test:4178/link');
        await address.press('Enter');
      }
      const iframe = page.locator(normal ? 'iframe' : '.pane[data-index="0"] iframe');
      const frame = iframe.contentFrame();
      link = frame.getByTestId('link');
      await link.waitFor();
      if (process.argv.includes('--layer')) {
        await iframe.evaluate((element, apply) => { if (apply) element.style.willChange = 'transform'; }, mode === 'layered');
      }
      if (process.env.SPLIT8_PROBE_EVENTS === '1') {
        await page.evaluate(() => {
          window.__probeEvents = [];
          document.addEventListener('pointerdown', event => window.__probeEvents.push(`parent:${event.target?.nodeName}`), true);
        });
        await link.evaluate(element => {
          window.__probeEvents = [];
          document.addEventListener('pointerdown', event => window.__probeEvents.push(`child:${event.target?.nodeName}`), true);
        });
      }
      if (attempt === 0 && process.env.SPLIT8_PROBE_FRAME_TARGETS === '1') {
        const cdp = await context.newCDPSession(page);
        const targets = await cdp.send('Target.getTargets');
        process.stdout.write(`frame targets: ${JSON.stringify(targets.targetInfos.filter(target => target.type === 'iframe').map(target => target.url))}\n`);
        await cdp.detach();
      }
      if (mode === 'gradual') {
        const rect = await iframe.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 20 });
      } else if (mode === 'settled') {
        const rect = await link.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await link.click();
      await frame.getByTestId('marker').getByText('page2').waitFor({ timeout: 1500 });
      results[mode].push('pass');
    } catch (error) {
      results[mode].push(error.message.split('\n')[0]);
      if (process.env.SPLIT8_PROBE_EVENTS === '1' && page && link) {
        const parent = await page.evaluate(() => window.__probeEvents).catch(() => []);
        const child = await link.evaluate(() => window.__probeEvents).catch(() => []);
        process.stdout.write(`events: ${JSON.stringify({ parent, child })}\n`);
      }
    }
    finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
    process.stdout.write(`${mode}: ${results[mode].at(-1)}\n`);
  }
} finally { server.kill(); }
process.stdout.write(JSON.stringify(results) + '\n');
