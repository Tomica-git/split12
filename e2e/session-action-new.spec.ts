import { test, expect, openUrl, pane, site } from './fixtures';

test('R-71 セッション一覧の右上で閉じ、追加を開く・削除の右に置く', async ({ split }) => {
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const sidebar = split.getByRole('complementary', { name: 'セッション' });
  const actions = sidebar.locator('.sidebar-actions');
  // R-91: 開く became 命名, and each button carries its icon on the left.
  await expect(actions.locator('button')).toHaveText(['✏️命名', '❌削除', '➕追加', '📖編集']);
  const rows = sidebar.locator('.view-choice'); const before = split.url();
  // R-93: 追加 switches this same tab to the new view; the empty view left behind is not kept (R-90).
  await sidebar.getByRole('button', { name: '新しいビュー' }).click();
  await expect(split).not.toHaveURL(before);
  await expect(split).toHaveURL(/view=[a-f\d-]{36}/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('aria-current', 'page');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await sidebar.getByRole('button', { name: 'セッション一覧を閉じる' }).click();
  await expect(sidebar).toBeHidden();
  await expect(split.getByRole('button', { name: 'セッション一覧', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await split.reload(); await expect(sidebar).toBeHidden();
});

// R-93 (2026-11-12 user request, option B) replaces R-72: one Split12 per window. The action shows the Split12 already
// in the pressed window; a window without one gets a new independent view next to the pressed tab.
test('R-93 拡張機能ボタンはSplit12のあるウィンドウではそれを前に出し、ないウィンドウでは押したタブの隣に開く', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/token?original'));
  const original = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const sourcePage = context.waitForEvent('page');
  await sw.evaluate(url => chrome.windows.create({ url, type: 'normal' }), site('a', '/plain'));
  const normal = await sourcePage; await expect(normal).toHaveURL(site('a', '/plain'));
  const originalWindow = await split.evaluate(async () => (await chrome.tabs.getCurrent())!.windowId);
  const press = (url: string) => sw.evaluate(async url => {
    const source = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
    return (globalThis as unknown as { __split8Test: { openNewViewFromAction(source: chrome.tabs.Tab): Promise<number> } }).__split8Test.openNewViewFromAction(source);
  }, url);
  const created = context.waitForEvent('page');
  const nextId = await press(normal.url());
  const next = await created;
  await expect(next.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(new URL(next.url()).searchParams.get('view')).toMatch(/^[a-f0-9-]{36}$/);
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const source = tabs.find(tab => tab.url === site('a', '/plain'))!;
  const newTab = tabs.find(tab => tab.url === next.url())!;
  expect(newTab.id).toBe(nextId);
  expect(newTab.windowId).toBe(source.windowId); expect(newTab.windowId).not.toBe(originalWindow); expect(newTab.index).toBe(source.index + 1);
  await expect(pane(next, 0).locator('.empty')).toBeVisible();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(original!);
  // Windows that already have Split12 get it shown, including the source window pressed again; nothing is added.
  const pages = context.pages().length;
  expect(await press(normal.url())).toBe(nextId);
  expect(await press(next.url())).toBe(nextId);
  const splitId = await split.evaluate(async () => (await chrome.tabs.getCurrent())!.id);
  expect(await press(split.url())).toBe(splitId);
  expect(context.pages()).toHaveLength(pages);
  expect((await sw.evaluate(() => chrome.tabs.query({}))).filter(tab => tab.windowId === source.windowId)).toHaveLength(2);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(original!);
});
