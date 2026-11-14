import { test, expect, openUrl, pane, site } from './fixtures';

// 0.1.93f changed R-45: the arrow opens the page in a new tab of the same window and keeps the pane and the split view.
test('R-45 矢印は現在URLを同じウィンドウの新しいタブで開き対象枠も分割画面も保つ', async ({ split, context }) => {
  const target = site('a', '/plain?from=split#section');
  await openUrl(split, 0, target);
  await openUrl(split, 1, site('b', '/token'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toBeVisible();
  const other = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  const originalWindow = await split.evaluate(async () => (await chrome.windows.getCurrent()).id);
  const opened = context.waitForEvent('page');
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  const page = await opened;
  await expect(page).toHaveURL(target);
  await expect.poll(async () => split.evaluate(async ({ url, originalWindow }) => {
    const tabs = await chrome.tabs.query({});
    return tabs.some(tab => tab.url === url && Number.isInteger(tab.windowId) && tab.windowId === originalWindow);
  }, { url: target, originalWindow })).toBe(true);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(target);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toBeVisible();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(other!);
});

test('R-45 最後の1枠から新しいタブで開いても枠は空にならない', async ({ split, context }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('1'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const target = site('a', '/plain?last=1');
  await openUrl(split, 0, target);
  const opened = context.waitForEvent('page');
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await expect(await opened).toHaveURL(target);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(target);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toBeVisible();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('1');
});

test('R-45 タブ作成に失敗したとき対象と他の枠を保持する', async ({ split }) => {
  const target = site('a', '/plain');
  await openUrl(split, 0, target);
  await openUrl(split, 1, site('b', '/token'));
  const other = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  await split.evaluate(() => { chrome.tabs.create = (async () => { throw new Error('failure'); }) as typeof chrome.tabs.create; });
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await expect(pane(split, 0).getByRole('status')).toContainText('開けませんでした');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(target);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(other!);
});

test('R-45 作成処理中に移動した枠は成功後も閉じない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await split.evaluate(() => {
    const gate = new Promise<chrome.tabs.Tab>(resolve => {
      (window as unknown as { resolveWindow: () => void }).resolveWindow = () => resolve({ id: 123 } as chrome.tabs.Tab);
    });
    chrome.tabs.create = (() => gate) as typeof chrome.tabs.create;
  });
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await openUrl(split, 0, site('b', '/page2'));
  await split.evaluate(() => (window as unknown as { resolveWindow: () => void }).resolveWindow());
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/page2'));
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-45 作成待ち中にページ内で元URLへ戻っても新しい内容を閉じない', async ({ split }) => {
  const url = site('a', '/plain');
  await openUrl(split, 0, url);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toBeVisible();
  await split.evaluate(() => {
    const gate = new Promise<chrome.tabs.Tab>(resolve => {
      (window as unknown as { resolveWindow: () => void }).resolveWindow = () => resolve({ id: 123 } as chrome.tabs.Tab);
    });
    chrome.tabs.create = (() => gate) as typeof chrome.tabs.create;
  });
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await frame.locator('body').evaluate((_element, next) => { location.href = next; }, site('a', '/page2'));
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/page2'));
  await frame.locator('body').evaluate((_element, next) => { location.href = next; }, url);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(url);
  await split.evaluate(() => (window as unknown as { resolveWindow: () => void }).resolveWindow());
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(url);
});

test('R-45 作成待ち中に表示数を減らして戻しても元の枠を閉じない', async ({ split }) => {
  await openUrl(split, 3, site('a', '/plain'));
  await split.evaluate(() => {
    const gate = new Promise<chrome.tabs.Tab>(resolve => {
      (window as unknown as { resolveWindow: () => void }).resolveWindow = () => resolve({ id: 123 } as chrome.tabs.Tab);
    });
    chrome.tabs.create = (() => gate) as typeof chrome.tabs.create;
  });
  await pane(split, 3).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.evaluate(() => (window as unknown as { resolveWindow: () => void }).resolveWindow());
  await expect(pane(split, 3).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/plain'));
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-45 作成待ち中に枠を閉じ同じURLで再利用しても新しい枠を閉じない', async ({ split }) => {
  const url = site('a', '/plain');
  await openUrl(split, 0, url);
  await split.evaluate(() => {
    const gate = new Promise<chrome.tabs.Tab>(resolve => {
      (window as unknown as { resolveWindow: () => void }).resolveWindow = () => resolve({ id: 123 } as chrome.tabs.Tab);
    });
    chrome.tabs.create = (() => gate) as typeof chrome.tabs.create;
  });
  await pane(split, 0).getByRole('button', { name: 'このページを新しいタブで開く' }).click();
  await pane(split, 0).getByRole('button', { name: '閉じる', exact: true }).click();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await openUrl(split, 3, url);
  await split.evaluate(() => (window as unknown as { resolveWindow: () => void }).resolveWindow());
  await expect(pane(split, 3).getByRole('combobox', { name: 'アドレス' })).toHaveValue(url);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});
