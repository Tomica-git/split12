import { test, expect, createNewView, openUrl, pane, site } from './fixtures';

test('R-75 空のビューを閉じると一覧から自動削除する', async ({ split, context, sw }) => {
  const opened = context.waitForEvent('page'); await createNewView(split); const view = await opened;
  await expect(view.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  const id = new URL(view.url()).searchParams.get('view')!;
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(true);
  await view.close();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-75 非表示の枠にページが残るビューは閉じても保持する', async ({ split, context, sw }) => {
  const opened = context.waitForEvent('page'); await createNewView(split); const view = await opened;
  await openUrl(view, 3, site('a', '/plain?hidden=1'));
  await expect(pane(view, 3).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const count = view.getByRole('spinbutton', { name: '表示数', exact: true }); await count.fill('2'); await count.press('Enter');
  const id = new URL(view.url()).searchParams.get('view')!;
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get(`workspace:${id}`))[`workspace:${id}`] as { panes: Array<{ url: string }> })?.panes[3]?.url, id)).toContain('hidden=1');
  await view.close();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(true);
  const saved = await sw.evaluate(async id => (await chrome.storage.local.get(`workspace:${id}`))[`workspace:${id}`], id) as { panes: Array<{ url: string }> };
  expect(saved.panes.some(pane => pane.url.includes('hidden=1'))).toBe(true);
});

test('R-75 ページを空にしたビューは閉じると削除される', async ({ split, context, sw }) => {
  const opened = context.waitForEvent('page'); await createNewView(split); const view = await opened;
  const id = new URL(view.url()).searchParams.get('view')!;
  await openUrl(view, 0, site('a', '/plain?clear-before-close'));
  await expect(pane(view, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(view, 0).locator('.pane-number').click({ button: 'right' });
  await view.getByRole('menuitem', { name: 'この枠を空にする' }).click();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get(`workspace:${id}`))[`workspace:${id}`] as { panes: Array<{ url: string }> })?.panes.every(pane => !pane.url), id)).toBe(true);
  await expect.poll(() => sw.evaluate(async id => Object.values((await chrome.storage.session.get('closingViews')).closingViews as Record<string, { id: string; empty: boolean }> ?? {}).some(entry => entry.id === id && entry.empty), id)).toBe(true);
  await view.close();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(false);
});

test('R-75 ページを開いた直後に閉じたビューのURLを保つ', async ({ split, context, sw }) => {
  const opened = context.waitForEvent('page'); await createNewView(split); const view = await opened;
  const id = new URL(view.url()).searchParams.get('view')!; const url = site('a', '/plain?save-before-close');
  await openUrl(view, 0, url);
  await expect(pane(view, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await view.close();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(true);
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get(`workspace:${id}`))[`workspace:${id}`] as { panes: Array<{ url: string }> } | undefined)?.panes[0]?.url, id)).toBe(url);
});

test('R-75 ページの読み込み準備中に閉じても空と判定しない', async ({ split, context, sw }) => {
  const opened = context.waitForEvent('page'); await createNewView(split); const view = await opened;
  const id = new URL(view.url()).searchParams.get('view')!;
  await view.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add') return new Promise(() => {});
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(view, 0, site('a', '/plain?preparing'));
  await expect.poll(() => sw.evaluate(async id => Object.values((await chrome.storage.session.get('closingViews')).closingViews as Record<string, { id: string; empty: boolean }> ?? {}).some(entry => entry.id === id && !entry.empty), id)).toBe(true);
  await view.close();
  await expect.poll(() => sw.evaluate(async id => ((await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ id: string }> }).views.some(view => view.id === id), id)).toBe(true);
});
