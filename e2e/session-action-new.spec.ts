import { test, expect, openUrl, pane, site } from './fixtures';

test('R-71 セッション一覧の右上で閉じ、追加を開く・削除の右に置く', async ({ split }) => {
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const sidebar = split.getByRole('complementary', { name: 'セッション' });
  const actions = sidebar.locator('.sidebar-actions');
  await expect(actions.locator('button')).toHaveText(['開く', '削除', '追加', '編集']);
  const rows = sidebar.locator('.view-choice'); const original = await rows.count();
  await sidebar.getByRole('button', { name: '新しいビュー' }).click();
  await expect(rows).toHaveCount(original + 1);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await sidebar.getByRole('button', { name: 'セッション一覧を閉じる' }).click();
  await expect(sidebar).toBeHidden();
  await expect(split.getByRole('button', { name: 'セッション一覧', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await split.reload(); await expect(sidebar).toBeHidden();
});

test('R-72 拡張機能ボタンは操作元と同じウィンドウに独立したビューを作る', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/token?original'));
  const original = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const sourcePage = context.waitForEvent('page');
  await sw.evaluate(url => chrome.windows.create({ url, type: 'normal' }), site('a', '/plain'));
  const normal = await sourcePage; await expect(normal).toHaveURL(site('a', '/plain'));
  const originalWindow = await split.evaluate(async () => (await chrome.tabs.getCurrent())!.windowId);
  const created = context.waitForEvent('page');
  await sw.evaluate(async url => {
    const source = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
    await (globalThis as unknown as { __split8Test: { openNewViewFromAction(source: chrome.tabs.Tab): Promise<number> } }).__split8Test.openNewViewFromAction(source);
  }, normal.url());
  const next = await created;
  await expect(next.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(new URL(next.url()).searchParams.get('view')).toMatch(/^[a-f0-9-]{36}$/);
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const source = tabs.find(tab => tab.url === site('a', '/plain'))!;
  const newTab = tabs.find(tab => tab.url === next.url())!;
  expect(newTab.windowId).toBe(source.windowId); expect(newTab.windowId).not.toBe(originalWindow); expect(newTab.index).toBe(source.index + 1);
  await expect(pane(next, 0).locator('.empty')).toBeVisible();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(original!);
  const again = context.waitForEvent('page');
  await sw.evaluate(async url => {
    const source = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
    await (globalThis as unknown as { __split8Test: { openNewViewFromAction(source: chrome.tabs.Tab): Promise<number> } }).__split8Test.openNewViewFromAction(source);
  }, normal.url());
  const third = await again; await expect(third.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(third.url()).not.toBe(next.url());
});
