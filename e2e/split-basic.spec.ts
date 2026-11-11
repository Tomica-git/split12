import { test, expect, pane, openUrl, site } from './fixtures';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('R-01 アイコンと同じ処理で既存の分割タブを再利用する', async ({ context, sw, extensionId }) => {
  const open = () => sw.evaluate(() => (globalThis as typeof globalThis & { __split8Test: { openOrFocusSplitView(): Promise<number> } }).__split8Test.openOrFocusSplitView());
  const first = await open();
  await expect.poll(() => context.pages().filter(p => p.url().startsWith(`chrome-extension://${extensionId}/split.html`)).length).toBe(1);
  const second = await open();
  expect(second).toBe(first);
  expect(context.pages().filter(p => p.url().startsWith(`chrome-extension://${extensionId}/split.html`))).toHaveLength(1);
  const focused = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id);
  expect(focused).toBe(first);
});
test('R-01 分割タブを別ページへ移動後は新しい分割タブを開く', async ({ context, sw, split, extensionId }) => {
  await split.goto(site('a', '/plain'));
  await expect.poll(async () => sw.evaluate(async () => (await chrome.storage.session.get('splitTabId')).splitTabId)).toBeUndefined();
  await sw.evaluate(() => (globalThis as typeof globalThis & { __split8Test: { openOrFocusSplitView(): Promise<number> } }).__split8Test.openOrFocusSplitView());
  await expect.poll(() => context.pages().filter(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`)).length).toBe(1);
});

async function assertTiled(page: Page, count: number): Promise<void> {
  const grid = await page.locator('.grid').boundingBox();
  const boxes = await Promise.all(Array.from({ length: count }, (_, index) => pane(page, index).boundingBox()));
  expect(grid).toBeTruthy();
  let area = 0;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!; expect(a).toBeTruthy();
    area += a.width * a.height;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      expect(w * h).toBeLessThan(1);
    }
  }
  expect(Math.abs(area - grid!.width * grid!.height)).toBeLessThan(grid!.width + grid!.height);
}
test('R-02 4・5・8 枚の配置は重ならず画面を埋める', async ({ split }) => {
  await assertTiled(split, 4);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter'); await assertTiled(split, 5);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('8'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: /縦並び/ }).click(); await assertTiled(split, 8);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('12'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter'); await assertTiled(split, 12);
});
test('R-03 表示中のページは配置変更で再読み込みされない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token'));
  const token = pane(split, 0).frameLocator('iframe').getByTestId('token');
  await expect(token).toBeVisible();
  const value = await token.textContent();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('8'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: /縦並び/ }).click();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(token).toHaveText(value!);
});
test('R-06 指定サイトの XFO と frame-ancestors を分割タブ内で許可する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/xfo'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  await openUrl(split, 1, site('a', '/csp-fa'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('csp-fa');
});
test('S-01 普通のタブでは埋め込み保護が残る', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toBeVisible();
  const normal = await context.newPage();
  await normal.goto(site('b', `/frame?src=${encodeURIComponent(site('a', '/xfo'))}`));
  await expect(normal.locator('body')).toHaveAttribute('data-child-loaded', '1');
  await expect(normal.frameLocator('iframe').getByTestId('marker')).toHaveCount(0);
});
test('S-03 埋め込みページは自動・クリック・リンクで親を遷移できない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/bust'));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('bust');
  const original = split.url();
  await frame.getByTestId('bust-button').click();
  await frame.getByTestId('bust-link').click();
  // A short bounded observation is needed to assert that no navigation follows.
  await split.waitForTimeout(200);
  expect(split.url()).toBe(original);
  await expect(frame.getByTestId('marker')).toHaveText('bust');
});
test('S-04 frame-ancestors のない CSP は保持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/csp-other'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('blocked');
});
test('S-05 ビルド済み manifest は外部公開と接続を許可しない', async () => {
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  expect(manifest).not.toHaveProperty('web_accessible_resources');
  expect(manifest).not.toHaveProperty('externally_connectable');
  for (const file of ['background.js', 'split.js', 'pane-boot.js', 'drag-bridge.js']) {
    const source = await readFile(`dist/${file}`, 'utf8');
    expect(source).not.toMatch(/\beval\s*\(|\bnew\s+Function\s*\(/);
  }
  for (const file of ['split.html', 'pane-boot.html']) {
    const html = await readFile(`dist/${file}`, 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i);
  }
});
