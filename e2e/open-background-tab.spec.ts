import { test, expect, openUrl, pane, site } from './fixtures';

test('R-45 矢印は同じウィンドウの背景タブで開き分割画面とページを保持する', async ({ split, context }) => {
  const url = site('a', '/token?background=1');
  await openUrl(split, 0, url);
  await openUrl(split, 1, site('b', '/token?other=1'));
  const source = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const other = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  const windowId = await split.evaluate(async () => (await chrome.tabs.getCurrent())!.windowId);
  const opened = context.waitForEvent('page');
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く', exact: true }).click();
  const tab = await opened;
  await expect(tab).toHaveURL(url);
  await expect.poll(() => split.evaluate(async ({ url, windowId }) => {
    const tabs = await chrome.tabs.query({ windowId });
    return { newTab: tabs.some(t => t.url === url && !t.active), splitActive: tabs.some(t => t.active && t.url === location.href) };
  }, { url, windowId })).toEqual({ newTab: true, splitActive: true });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(source!);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(other!);
});

test('R-45 新しいタブの作成失敗時は枠を保持して通知する', async ({ split }) => {
  const url = site('a', '/plain'); await openUrl(split, 0, url);
  await split.evaluate(() => { chrome.tabs.create = (async () => { throw new Error('failure'); }) as typeof chrome.tabs.create; });
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く', exact: true }).click();
  await expect(pane(split, 0).getByRole('status')).toContainText('開けませんでした');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(url);
});
