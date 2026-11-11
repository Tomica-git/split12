import { test, expect, openUrl, pane, site } from './fixtures';

test('R-73 一覧の番号を順送りしても実ページの位置と状態を保ち復元できる', async ({ split }) => {
  for (let i = 0; i < 3; i++) await openUrl(split, i, site('a', `/token?slot=${i}`));
  const slots = [0, 1, 2].map(i => split.locator(`.pane[data-slot="${i}"]`));
  const tokens = await Promise.all(slots.map(slot => slot.frameLocator('iframe').getByTestId('token').textContent()));
  const boxes = await Promise.all(slots.map(slot => slot.boundingBox()));
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  await dialog.getByRole('button', { name: 'タブ 1 を移動' }).dragTo(dialog.getByRole('listitem').nth(2));
  const rows = dialog.getByRole('listitem');
  await expect(rows.nth(0)).toContainText('slot=1'); await expect(rows.nth(1)).toContainText('slot=2'); await expect(rows.nth(2)).toContainText('slot=0');
  await dialog.getByRole('button', { name: '一覧を閉じる' }).click();
  for (let i = 0; i < 3; i++) {
    expect(await slots[i]!.boundingBox()).toEqual(boxes[i]);
    await expect(slots[i]!.frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
    await expect(slots[i]!).toHaveAttribute('data-index', String([2, 0, 1][i]));
  }
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  for (let i = 0; i < 3; i++) await expect(slots[i]!).toHaveAttribute('data-index', String(i));
  await split.getByRole('button', { name: '変更をやり直す' }).click();
  await split.reload();
  for (let i = 0; i < 3; i++) { expect(await slots[i]!.boundingBox()).toEqual(boxes[i]); await expect(slots[i]!).toHaveAttribute('data-index', String([2, 0, 1][i])); }
});

for (const [direction, selector] of [['left', '.split-left'], ['right', '.split-x'], ['up', '.split-up'], ['down', '.split-y']] as const) {
  test(`R-74 ${direction}を右クリックで固定しリンクを固定枠の方向へ追加`, async ({ split, sw }) => {
    const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
    await count.fill('2'); await count.press('Enter');
    const button = split.locator(selector);
    await button.click({ button: 'right' });
    await expect(button).toHaveClass(/link-direction-fixed/);
    await split.reload(); await expect(button).toHaveClass(/link-direction-fixed/);
    const url = site('a', `/page2?fixed=${direction}`);
    expect(await sw.evaluate(async ({ url, splitUrl }) => {
      const tab = (await chrome.tabs.query({})).find(item => item.url === splitUrl)!;
      return (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }, tab: chrome.tabs.Tab): Promise<boolean> } }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: url }, tab);
    }, { url, splitUrl: split.url() })).toBe(true);
    await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
    const fixed = (await split.locator('.pane[data-slot="0"]').boundingBox())!, added = (await pane(split, 2).boundingBox())!;
    if (direction === 'left') expect(added.x + added.width).toBeLessThanOrEqual(fixed.x + 1);
    if (direction === 'right') expect(added.x).toBeGreaterThanOrEqual(fixed.x + fixed.width - 1);
    if (direction === 'up') expect(added.y + added.height).toBeLessThanOrEqual(fixed.y + 1);
    if (direction === 'down') expect(added.y).toBeGreaterThanOrEqual(fixed.y + fixed.height - 1);
    await button.click({ button: 'right' }); await expect(button).not.toHaveClass(/link-direction-fixed/);
    await split.reload(); await expect(button).not.toHaveClass(/link-direction-fixed/);
  });
}

test('R-74 明示方向は固定した既定方向より優先する', async ({ split, sw }) => {
  await split.locator('.split-up').click({ button: 'right' });
  expect(await sw.evaluate(async splitUrl => {
    const tab = (await chrome.tabs.query({})).find(item => item.url === splitUrl)!;
    return (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }, tab: chrome.tabs.Tab): Promise<boolean> } }).__split8Test.handleContextMenu({ menuItemId: 'split8-link-right', linkUrl: 'http://a.test:4178/page2?override' }, tab);
  }, split.url())).toBe(true);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const fixed = (await split.locator('.pane[data-slot="0"]').boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect(added.x).toBeGreaterThanOrEqual(fixed.x + fixed.width - 1);
});

test('R-74 分割ビューを閉じた後も固定方向でリンクを追加する', async ({ split, context, sw, extensionId }) => {
  await split.locator('.split-up').click({ button: 'right' });
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('fixedLinkDirection')).fixedLinkDirection)).toBe('up');
  await split.close();
  expect(await sw.evaluate(() => (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }): Promise<boolean> } }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: 'http://a.test:4178/page2?pending' }))).toBe(true);
  await expect.poll(() => context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))?.url()).toBeTruthy();
  const next = context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))!;
  await expect(pane(next, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const fixed = (await next.locator('.pane[data-slot="0"]').boundingBox())!, added = (await pane(next, 4).boundingBox())!;
  expect(added.y + added.height).toBeLessThanOrEqual(fixed.y + 1);
});
