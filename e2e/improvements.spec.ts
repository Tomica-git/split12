import { test, expect, openUrl, pane, site, moveIntoFrame, launch, createNewView } from './fixtures';

test('ドロップした URL を指定ペインで開き危険な形式を拒否する', async ({ split }) => {
  const target = site('a', '/plain');
  // R-79: the drop position decides the pane, so the synthetic event carries the pane's centre.
  const dropOn = (index: number, type: string, value: string) => split.locator(`.pane[data-index="${index}"] .pane-view`).evaluate((element, [type, value]) => {
    const data = new DataTransfer(); data.setData(type!, value!);
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
  }, [type, value]);
  await dropOn(1, 'text/uri-list', target);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await dropOn(0, 'text/plain', 'javascript:alert(1)');
  await expect(split.getByRole('status').filter({ hasText: 'http または https の URL を入力してください' })).toBeVisible();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('タブ選択に表示済み URL や同一 URL の候補を重複表示しない', async ({ split, context }) => {
  const shown = site('a', '/plain');
  await openUrl(split, 0, shown);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  for (const url of [shown, site('b', '/page2'), site('b', '/page2')]) {
    const tab = await context.newPage(); await tab.goto(url);
  }
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '開いているタブから追加' }).click();
  const dialog = split.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: /Fixture \/plain/ })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /Fixture \/page2/ })).toHaveCount(1);
});

test('3＋1 配置を作り境界を移動・反転し保存する', async ({ split }) => {
  await split.getByRole('button', { name: '3＋1' }).click();
  const grid = (await split.locator('.grid').boundingBox())!;
  const bottomBefore = (await pane(split, 3).boundingBox())!;
  expect(bottomBefore.width).toBeCloseTo(grid.width, 0);
  const divider = split.getByRole('button', { name: '上下の境界' }).first();
  const handle = (await divider.boundingBox())!;
  await split.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await split.mouse.down();
  await split.mouse.move(handle.x + handle.width / 2, grid.y + grid.height * .7, { steps: 5 });
  await split.mouse.up();
  const moved = (await pane(split, 3).boundingBox())!;
  expect(moved.y).toBeGreaterThan(bottomBefore.y + grid.height * .1);
  await split.reload();
  await expect.poll(async () => (await pane(split, 3).boundingBox())?.y).toBeCloseTo(moved.y, 0);
  await split.getByRole('button', { name: '上下の境界' }).first().dblclick();
  const flipped = (await pane(split, 3).boundingBox())!;
  expect(flipped.y).toBeCloseTo(grid.y, 0);
});

test('選択ペインを左右・上下に分割する', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('1'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: '左右に追加' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  await split.getByRole('button', { name: '上下に追加' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  const first = (await pane(split, 0).boundingBox())!;
  const third = (await pane(split, 2).boundingBox())!;
  expect(third.y).toBeGreaterThan(first.y);
});

test('複数の分割ビューは個別に保存され両方で埋め込みを許可する', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/xfo'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  const newPage = context.waitForEvent('page');
  await createNewView(split);
  const second = await newPage;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(second, 0).locator('.empty')).toBeVisible();
  await openUrl(second, 0, site('a', '/xfo'));
  await expect(pane(second, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  await second.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await second.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await second.reload();
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(second, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules())[0]?.condition.tabIds?.length)).toBe(2);
  await second.close();
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules())[0]?.condition.tabIds?.length)).toBe(1);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
});

test('複数ビューの内容はブラウザ再起動後もそれぞれ復元する', async ({ profile }) => {
  let context = await launch(profile);
  try {
    let sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    let first = await context.newPage();
    await first.goto(`chrome-extension://${id}/split.html`);
    await expect(first.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    await openUrl(first, 0, site('a', '/plain'));
    await expect(pane(first, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
    const created = context.waitForEvent('page');
    await createNewView(first);
    let second = await created;
    await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    const secondUrl = second.url();
    await second.getByRole('spinbutton', { name: '表示数', exact: true }).fill('6'); await second.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
    await openUrl(second, 0, site('b', '/page2'));
    await expect(pane(second, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
    const viewId = new URL(secondUrl).searchParams.get('view');
    expect(viewId).toBeTruthy();
    await expect.poll(() => sw.evaluate(async key => {
      const saved = await chrome.storage.local.get(key);
      return (saved[key] as { count?: number; panes?: Array<{ url: string }> } | undefined)?.panes?.[0]?.url;
    }, `workspace:${viewId}`)).toBe(site('b', '/page2'));
    await context.close();
    context = await launch(profile);
    sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    first = await context.newPage();
    await first.goto(`chrome-extension://${new URL(sw.url()).host}/split.html`);
    await expect(pane(first, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
    second = await context.newPage();
    await second.goto(secondUrl);
    await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('6');
    await expect(pane(second, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
    await expect(first.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  } finally { await context.close(); }
});

test('R-40 R-41 設定から表示数のショートカットを確認・変更できる', async ({ split, context }) => {
  await split.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = split.getByRole('dialog');
  await expect(dialog.getByText('キーボードショートカット')).toBeVisible();
  await expect(dialog.getByText('分割数を増やす')).toBeVisible();
  await expect(dialog.getByText('分割数を減らす')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ショートカットを変更' })).toBeVisible();
  const opened = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'ショートカットを変更' }).click();
  const settings = await opened;
  await expect(settings).toHaveURL('chrome://extensions/shortcuts');
});

test('Chrome で変更したショートカットをページ内から使用する', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('plain');
  const settings = await context.newPage();
  await settings.goto('chrome://extensions/shortcuts');
  await settings.getByRole('button', { name: /ショートカット 分割数を増やす を編集/ }).click();
  await settings.keyboard.press('Alt+Shift+K');
  await expect.poll(() => sw.evaluate(async () => (await chrome.commands.getAll()).find(command => command.name === 'pane-increase')?.shortcut)).toMatch(/K/i);
  await split.bringToFront();
  await moveIntoFrame(split, 0);
  await frame.getByTestId('marker').click();
  await split.keyboard.press('Alt+Shift+K');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await split.keyboard.press('Alt+Shift+ArrowUp');
  await split.waitForTimeout(500); // Check that the old binding no longer changes the count.
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).focus();
  await split.keyboard.press('Alt+Shift+K');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('6');
});

// R-11 / R-19 (0.1.93f): links that open a new tab stay normal tabs; the split view does not capture them.
test('R-11 ペイン内の新規タブリンクは通常のタブのまま残し枠を増やさない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/link?new=1&to=${encodeURIComponent(site('a', '/page2'))}`));
  await expect(pane(split, 0).locator('iframe')).toHaveCSS('pointer-events', 'auto');
  await moveIntoFrame(split, 0);
  const pages = context.pages().length;
  const opened = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('link').click();
  const original = await opened;
  await expect(original).toHaveURL(site('a', '/page2'));
  await expect(original.getByTestId('marker')).toHaveText('page2');
  await split.waitForTimeout(1000); // Any background handler has run by now; nothing may capture or close the tab.
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 4)).toBeHidden();
  expect(original.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(pages + 1);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
});

test('R-11 ペイン内リンクを Command クリックしても枠は増えず通常のタブで開く', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/link?to=${encodeURIComponent(site('a', '/page2'))}`));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await moveIntoFrame(split, 0);
  const opened = context.waitForEvent('page');
  await frame.getByTestId('link').click({ modifiers: ['Meta'] });
  const tab = await opened;
  await expect(tab).toHaveURL(site('a', '/page2'));
  await split.waitForTimeout(500);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  expect(tab.isClosed()).toBe(false);
});

test('ペイン内リンクの右クリックがページに届きメニューを妨げない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const frame = pane(split, 0).frameLocator('iframe');
  const link = frame.getByTestId('link');
  await expect(link).toBeVisible();
  await link.evaluate(element => element.addEventListener('contextmenu', event => {
    element.setAttribute('data-right-click', `${event.isTrusted}:${event.defaultPrevented}`);
  }));
  await moveIntoFrame(split, 0);
  await link.click({ button: 'right' });
  await expect(link).toHaveAttribute('data-right-click', 'true:false');
});

test('ペイン内のポップアップウィンドウはそのまま開く', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/popup'));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('popup');
  await moveIntoFrame(split, 0);
  const popupPromise = context.waitForEvent('page');
  await frame.getByTestId('popup').click();
  const popup = await popupPromise;
  await expect(popup.getByTestId('marker')).toHaveText('page2');
  await split.waitForTimeout(1000); // Allow the asynchronous navigation-target handler to run.
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect.poll(() => popup.isClosed()).toBe(false);
});

// The three capture-and-close scenarios (failed load, slow page, foregrounded tab) collapse into this one:
// with no capture, the new tab is never closed, however its page loads.
test('R-11 新しいタブで開いた遅いページも取り込まず、読み込みが終わってもタブを閉じない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/link?new=1&to=${encodeURIComponent(site('a', '/slow'))}`));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await moveIntoFrame(split, 0);
  const opened = context.waitForEvent('page');
  await frame.getByTestId('link').click();
  const original = await opened;
  await expect(original.getByTestId('marker')).toHaveText('slow');
  await split.waitForTimeout(1000);
  expect(original.isClosed()).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 4)).toBeHidden();
});

test('ショートカットで表示数を増減する', async ({ split }) => {
  await split.keyboard.press('Alt+Shift+ArrowUp');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await split.keyboard.press('Alt+Shift+ArrowDown');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('ページ内にフォーカスがある状態でもショートカットで表示数を増減する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await moveIntoFrame(split, 0);
  await frame.getByTestId('marker').click();
  await expect.poll(() => split.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
  await split.keyboard.press('Alt+Shift+ArrowUp');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await split.keyboard.press('Alt+Shift+ArrowDown');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('ページが作ったキーイベントで分割数を変更しない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const frame = pane(split, 0).frameLocator('iframe');
  const marker = frame.getByTestId('marker');
  await expect(marker).toHaveText('plain');
  await moveIntoFrame(split, 0);
  await marker.click();
  await split.keyboard.press('Alt+Shift+ArrowUp');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await marker.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true })));
  await split.waitForTimeout(1000); // Verify that the asynchronous message is not sent.
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
});

test('通常タブでは分割数ショートカットのキー入力を横取りしない', async ({ split, context }) => {
  const page = await context.newPage();
  await page.goto(site('a', '/plain'));
  await page.evaluate(() => {
    document.addEventListener('keydown', event => {
      if (event.altKey && event.shiftKey && event.key === 'ArrowUp') document.body.dataset.shortcutPrevented = String(event.defaultPrevented);
    });
  });
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-shortcut-prevented', 'false');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('Chrome のコマンドを受け取った分割ビューだけ表示数が変わる', async ({ split, sw }) => {
  await sw.evaluate(async () => {
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    const hooks = (globalThis as typeof globalThis & { __split8Test: { handleCommand(command: string, tab: chrome.tabs.Tab | undefined): Promise<void> } }).__split8Test;
    await hooks.handleCommand('pane-increase', tab);
  });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
});

test('ペイン番号をドラッグして位置を交換し表示中のページを維持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token'));
  await openUrl(split, 1, site('b', '/token'));
  const first = pane(split, 0).frameLocator('iframe').getByTestId('token');
  const second = pane(split, 1).frameLocator('iframe').getByTestId('token');
  await expect(first).toBeVisible(); await expect(second).toBeVisible();
  const value = await first.textContent();
  const a = (await pane(split, 0).boundingBox())!, b = (await pane(split, 1).boundingBox())!;
  await pane(split, 0).locator('.pane-number').dragTo(pane(split, 1).locator('.pane-bar'));
  await expect.poll(async () => (await pane(split, 0).boundingBox())?.x).toBeCloseTo(b.x, 0);
  await expect.poll(async () => (await pane(split, 1).boundingBox())?.x).toBeCloseTo(a.x, 0);
  await expect(first).toHaveText(value!);
});

test('ページ内リンクを別のペインへドラッグして表示する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  // A newly painted cross-process frame can be visible before Chromium routes mouse input to it.
  // Wait for real hover in the child, otherwise mouseDown may hit the parent and never start a drag.
  await expect.poll(async () => { await link.hover(); return link.evaluate(element => element.matches(':hover')); }).toBe(true);
  const target = (await pane(split, 1).locator('.pane-view').boundingBox())!;
  await split.mouse.down();
  await split.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await split.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2);
  await split.mouse.up();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
