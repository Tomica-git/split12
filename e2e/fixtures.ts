import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

type Fixtures = { context: BrowserContext; sw: Worker; extensionId: string; split: Page; profile: string };
export async function launch(profile: string, options: { resolver?: string; testTls?: boolean } = {}): Promise<BrowserContext> {
  const dist = resolve('dist');
  return chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: process.env.SPLIT8_HEADED !== '1',
    // Used only by the isolated, locally generated HTTPS fixture.
    ignoreHTTPSErrors: options.testTls ?? false,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, `--host-resolver-rules=${options.resolver ?? 'MAP *.test 127.0.0.1'}`, '--no-proxy-server',
      // Service workers need a secure origin; the fixture site stands in for an https site.
      '--unsafely-treat-insecure-origin-as-secure=http://a.test:4178'],
  });
}
export const test = base.extend<Fixtures>({
  profile: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'split8-e2e-'));
    try { await use(profile); } finally { await rm(profile, { recursive: true, force: true }); }
  },
  context: async ({ profile }, use) => {
    const context = await launch(profile);
    try { await use(context); } finally { await context.close(); }
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(sw);
  },
  extensionId: async ({ sw }, use) => { await use(new URL(sw.url()).host); },
  split: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/split.html`);
    await expect(page.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    await use(page);
  },
});
export { expect };
export const site = (host: string, path: string): string => `http://${host}.test:4178${path}`;
export const pane = (page: Page, index: number) => page.locator(`.pane[data-index="${index}"]`);
export async function moveIntoFrame(page: Page, index: number): Promise<void> {
  const bounds = await pane(page, index).locator('iframe').boundingBox();
  if (!bounds) throw new Error('iframe is not visible');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 20 });
}
export async function openUrl(page: Page, index: number, url: string): Promise<void> {
  const address = pane(page, index).getByRole('combobox', { name: 'アドレス' });
  await address.fill(url);
  await address.press('Enter');
}

export async function enableDragDiagnostic(page: Page): Promise<void> {
  await page.evaluate(async () => { const { ui } = await chrome.storage.local.get('ui'); await chrome.storage.local.set({ ui: { ...(ui && typeof ui === 'object' ? ui : {}), schemaVersion: 1, dragDiagnostic: true } }); });
}
export async function openSessions(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'セッション一覧', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}
export async function createNewView(page: Page): Promise<void> {
  await openSessions(page);
  const sidebar = page.getByRole('complementary', { name: 'セッション' });
  const rows = sidebar.locator('.view-choice');
  const count = await rows.count();
  // R-93 (0.2.0): one Split12 per window, so 追加 now switches this tab. A second view open at the same time lives in
  // another window (pressing the action button in a window without Split12). Open such a window with a new view here.
  await page.evaluate(() => chrome.windows.create({ url: `${chrome.runtime.getURL('split.html')}?view=${crypto.randomUUID()}`, focused: true, type: 'normal' }));
  await expect(rows).toHaveCount(count + 1);
}
