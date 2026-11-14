import { test, expect, openUrl, pane, site, createNewView } from './fixtures';
import type { Locator, Page, Worker } from '@playwright/test';

async function clickInFrame(target: Locator): Promise<void> {
  await expect.poll(async () => {
    // Re-enter from outside the iframe when Chromium leaves hover on the parent.
    await target.page().mouse.move(1, 1);
    await target.hover();
    return target.evaluate(element => element.matches(':hover'));
  }).toBe(true);
  await target.click();
}

async function command(sw: Worker, page: Page, action: string): Promise<void> {
  await sw.evaluate(async ({ url, action }) => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
    await (globalThis as unknown as { __split8Test: { handleCommand(command: string, tab: chrome.tabs.Tab): Promise<void> } }).__split8Test.handleCommand(action, tab);
  }, { url: page.url(), action });
}

test('R-15 中間の枠を閉じると表示数と番号を繰り上げ生存ページを再読み込みしない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?first'));
  await openUrl(split, 1, site('a', '/plain?closed'));
  await openUrl(split, 2, site('b', '/token?third'));
  const first = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const third = await pane(split, 2).frameLocator('iframe').getByTestId('token').textContent();
  await pane(split, 1).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(pane(split, 1).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/token?third'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(first!);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(third!);
  await expect(pane(split, 1)).toHaveAttribute('aria-label', 'ペイン 2');
  await expect(pane(split, 1).locator('.pane-number')).toHaveText('02');
});

test('R-20 Shiftで選ぶ境界は最初と同じ方向だけを追加できる', async ({ split }) => {
  const vertical = split.getByRole('button', { name: '左右の境界', exact: true });
  const horizontal = split.getByRole('button', { name: '上下の境界', exact: true });
  await vertical.nth(0).click({ modifiers: ['Shift'] });
  await vertical.nth(1).click({ modifiers: ['Shift'] });
  await expect(vertical.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(vertical.nth(1)).toHaveAttribute('aria-pressed', 'true');
  // The middle of the horizontal handle crosses a vertical handle; click away from that crossing.
  await horizontal.first().click({ modifiers: ['Shift'], position: { x: 20, y: 4 } });
  await expect(horizontal.first()).toHaveAttribute('aria-pressed', 'false');
  await split.keyboard.press('Escape');
  await expect(vertical.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await horizontal.first().click({ modifiers: ['Shift'], position: { x: 20, y: 4 } });
  await expect(horizontal.first()).toHaveAttribute('aria-pressed', 'true');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(0);
});

test('R-15 R-16 削除した枠のURL・倍率・ページ履歴を復元し他のページは保つ', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?keep'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await openUrl(split, 1, site('b', '/link'));
  await clickInFrame(pane(split, 1).frameLocator('iframe').getByTestId('link'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await pane(split, 1).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 1).getByRole('button', { name: '67%', exact: true }).click();
  await pane(split, 1).getByRole('button', { name: '閉じる', exact: true }).click();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 1).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/page2'));
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('67%');
  await pane(split, 1).getByRole('button', { name: '戻る', exact: true }).click();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 1).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/link'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-15 最後の最大化枠を閉じても空の1枠を残し復元できる', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('1'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(split, 0).locator('.pane-number').dblclick();
  await pane(split, 0).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('1');
  await expect(pane(split, 0).locator('.empty')).toBeVisible();
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-15 閉鎖前の遅れた許可応答で繰り上げ先を上書きしない', async ({ split }) => {
  await openUrl(split, 1, site('b', '/token?survive'));
  const token = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    const state = window as typeof window & { releasePending(): void; pendingFinished: boolean };
    const gate = new Promise<void>(resolve => { state.releasePending = resolve; });
    state.pendingFinished = false;
    chrome.runtime.sendMessage = ((message: { type?: string }) => message.type === 'allowlist/add'
      ? gate.then(() => original(message)).finally(() => { state.pendingFinished = true; }) : original(message)) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(split, 0, site('a', '/plain?pending'));
  await pane(split, 0).getByRole('button', { name: '閉じる', exact: true }).click();
  await split.evaluate(() => (window as typeof window & { releasePending(): void }).releasePending());
  await expect.poll(() => split.evaluate(() => (window as typeof window & { pendingFinished: boolean }).pendingFinished)).toBe(true);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(split.locator('.pane[data-slot="0"] iframe')).toHaveCount(0);
});

test('R-16 配置のUndoは新しいページ遷移を巻き戻さず新操作でRedoを消す', async ({ split }) => {
  await split.getByRole('button', { name: '縦並び', exact: false }).click();
  await openUrl(split, 0, site('a', '/token?after-layout'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.getByRole('button', { name: '横並び', exact: false })).toHaveAttribute('aria-pressed', 'true');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await expect(split.getByRole('button', { name: '変更をやり直す', exact: true })).toBeEnabled();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('6'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(split.getByRole('button', { name: '変更をやり直す', exact: true })).toBeDisabled();
});

test('R-16 境界ドラッグは1履歴で戻りEscキャンセルは履歴を増やさない', async ({ split }) => {
  const initial = await pane(split, 0).boundingBox();
  const handle = split.getByRole('button', { name: '左右の境界', exact: true }).first();
  const box = (await handle.boundingBox())!;
  await split.mouse.move(box.x + 4, box.y + 20); await split.mouse.down();
  await split.mouse.move(box.x + 90, box.y + 20, { steps: 6 }); await split.mouse.up();
  expect((await pane(split, 0).boundingBox())!.width).toBeGreaterThan(initial!.width + 30);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await pane(split, 0).boundingBox()).toEqual(initial);
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
  const again = (await handle.boundingBox())!;
  await split.mouse.move(again.x + 4, again.y + 20); await split.mouse.down();
  await split.mouse.move(again.x + 90, again.y + 20, { steps: 3 });
  await split.keyboard.press('Escape'); await split.mouse.up();
  expect(await pane(split, 0).boundingBox()).toEqual(initial);
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
});

test('R-19 狭い枠を右クリックのタブ削除で閉じられる', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('12'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await pane(split, 3).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: 'タブを削除', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('11');
  await expect(pane(split, 3)).toHaveAttribute('data-slot', '4');
});

for (const [axis, label] of [['x', '左右'], ['y', '上下']] as const) test(`R-19 リンクを${label}に分割して追加し生存フレームを維持する`, async ({ split, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('1'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await openUrl(split, 0, site('a', '/token?source'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  expect(await sw.evaluate(async ({ axis, url }) => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url?.endsWith('/split.html'))!;
    const hooks = (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }, tab: chrome.tabs.Tab): Promise<boolean> } }).__split8Test;
    return hooks.handleContextMenu({ menuItemId: `split8-link-${axis}`, linkUrl: url }, tab);
  }, { axis, url: site('b', '/page2') })).toBe(true);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const first = (await pane(split, 0).boundingBox())!, next = (await pane(split, 1).boundingBox())!;
  expect(axis === 'x' ? next.x > first.x && next.y === first.y : next.y > first.y && next.x === first.x).toBe(true);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('1');
});

test('R-17 枠内でページ履歴キーを使うとその枠だけが戻る・進む', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  await clickInFrame(pane(split, 0).frameLocator('iframe').getByTestId('link'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await openUrl(split, 1, site('b', '/token?untouched'));
  const token = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  await clickInFrame(pane(split, 0).frameLocator('iframe').getByTestId('marker'));
  await split.keyboard.press('Control+-');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await clickInFrame(pane(split, 0).frameLocator('iframe').getByTestId('marker'));
  await split.keyboard.press('Control+Shift+-');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-17 コマンドは対象ビューだけを閉じ通常タブ・偽キー・Kを操作しない', async ({ split, context, sw }) => {
  const normal = await context.newPage(); await normal.goto(site('a', '/plain'));
  await command(sw, normal, 'close-pane');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await split.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', metaKey: true, shiftKey: true, bubbles: true })); });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  const result = await split.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true, bubbles: true })));
  expect(result).toBe(true);
  await pane(split, 2).getByRole('combobox', { name: 'アドレス' }).focus();
  await command(sw, split, 'close-pane');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await command(sw, split, 'layout-undo');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-18 ビュー一覧から独立ビューを開閉・再開し上下キーは一覧内で止まる', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/token?main'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const list = split.getByRole('navigation', { name: 'ビュー一覧' });
  await expect(list.getByRole('button')).toHaveCount(1);
  await split.locator('.toolbar .sidebar-toggle').focus();
  await split.keyboard.press('Meta+b'); await expect(list).toBeHidden();
  await split.keyboard.press('Meta+b'); await expect(list).toBeVisible();
  // R-93: one Split12 per window, so a second view open at the same time lives in another window.
  const created = context.waitForEvent('page');
  await createNewView(split);
  await expect(list.getByRole('button')).toHaveCount(2);
  const second = await created;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await openUrl(second, 0, site('b', '/page2?second'));
  await expect(pane(second, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const url = second.url();
  await expect(list.getByRole('button')).toHaveCount(2);
  await split.locator('.toolbar .sidebar-toggle').focus();
  await split.keyboard.press('Meta+ArrowDown');
  await expect(list.getByRole('button').nth(1)).toBeFocused();
  await command(sw, split, 'view-down');
  await expect(list.getByRole('button').nth(1)).toBeFocused();
  await split.keyboard.press('Meta+ArrowUp');
  await expect(list.getByRole('button').nth(0)).toBeFocused();
  await second.close();
  await expect(list.getByRole('button').nth(1)).toContainText('保存済み');
  // R-91/R-93: a saved view opens by double-click and switches this same tab; no tab is added.
  const pages = context.pages().length;
  await list.getByRole('button').nth(1).dblclick();
  await expect(split).toHaveURL(url);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  expect(context.pages()).toHaveLength(pages);
  // The view shown before keeps its page and comes back with it.
  await list.getByRole('button').nth(0).dblclick();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/token?main'));
  expect(token).toBeTruthy();
  await command(sw, split, 'toggle-sidebar');
  await expect(list).toBeHidden();
  await split.reload();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(list).toBeHidden();
});

test('R-18 同じビューURLを複製しても保存先が混ざらない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain?original'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const duplicate = await context.newPage(); await duplicate.goto(split.url());
  await expect(duplicate).toHaveURL(/view=[a-f\d-]{36}/);
  await expect(duplicate.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(duplicate, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/plain?original'));
  await openUrl(duplicate, 0, site('b', '/page2?copy'));
  await expect(pane(duplicate, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.reload();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/plain?original'));
});

test('R-16 倍率だけを戻す操作はその後のページ遷移とフレームを保つ', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(split, 0).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 0).getByRole('button', { name: '80%', exact: true }).click();
  await openUrl(split, 0, site('b', '/token?after-zoom'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/token?after-zoom'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('80%');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-16 配置交換と境界反転を順番に戻してもフレームは再生成しない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?swap'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const original = await pane(split, 0).boundingBox();
  await pane(split, 0).locator('.pane-number').dragTo(pane(split, 1).locator('.pane-bar'));
  const swapped = await pane(split, 0).boundingBox();
  expect(swapped!.x).not.toBe(original!.x);
  const divider = split.getByRole('button', { name: '上下の境界', exact: true }).first();
  await divider.dblclick({ position: { x: 20, y: 4 } });
  expect((await pane(split, 0).boundingBox())!.y).not.toBe(swapped!.y);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await pane(split, 0).boundingBox()).toEqual(swapped);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await pane(split, 0).boundingBox()).toEqual(original);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-17 ネスト内の信頼された削除キーは所有枠を閉じ普通のページには作用しない', async ({ split, context }) => {
  await openUrl(split, 1, site('a', `/nested?child=${encodeURIComponent(site('b', '/plain'))}`));
  const child = pane(split, 1).frameLocator('iframe').frameLocator('iframe').getByTestId('marker');
  await expect(child).toHaveText('plain');
  await clickInFrame(child);
  // R-69 moved ⌘⇧D to 「右に追加」; the delete key that still reaches the view is Ctrl⇧D.
  await split.keyboard.press('Control+Shift+D');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(pane(split, 1)).toHaveAttribute('data-slot', '2');
  const normal = await context.newPage(); await normal.goto(site('a', '/plain'));
  await normal.evaluate(() => {
    document.body.tabIndex = 0; document.body.focus();
    let prevented: boolean | undefined;
    document.addEventListener('keydown', event => { if (event.code === 'Minus') prevented = event.defaultPrevented; });
    (window as typeof window & { getPrevented(): boolean | undefined }).getPrevented = () => prevented;
  });
  await normal.keyboard.press('Control+-');
  await expect.poll(() => normal.evaluate(() => (window as typeof window & { getPrevented(): boolean | undefined }).getPrevented())).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
});

test('R-09 R-15 閉鎖後の実体ID・番号・URLを更新後も復元する', async ({ split, sw }) => {
  await openUrl(split, 2, site('a', '/plain?third'));
  await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(split, 1).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { order?: number[] }).order?.slice(0, 3))).toEqual([0, 2, 3]);
  await split.reload();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(pane(split, 1)).toHaveAttribute('data-slot', '2');
  await expect(pane(split, 1).locator('.pane-number')).toHaveText('02');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-16 R-06 許可待ちの追加をUndo・Redoしても許可応答前に読み込まない', async ({ split, sw }) => {
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    const state = window as typeof window & { releaseAllow(): void; allowWaiting: boolean };
    const gate = new Promise<void>(resolve => { state.releaseAllow = resolve; }); state.allowWaiting = false;
    chrome.runtime.sendMessage = ((message: { type?: string }) => {
      if (message.type === 'allowlist/add') { state.allowWaiting = true; return gate.then(() => original(message)); }
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  const adding = sw.evaluate(async url => {
    const hooks = (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }): Promise<boolean> } }).__split8Test;
    return hooks.handleContextMenu({ menuItemId: 'split8-link', linkUrl: url });
  }, site('a', '/xfo?delayed-add')).catch(() => false);
  await expect.poll(() => split.evaluate(() => (window as typeof window & { allowWaiting: boolean }).allowWaiting)).toBe(true);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await expect(pane(split, 4).locator('iframe')).toHaveCount(0);
  await split.evaluate(() => (window as typeof window & { releaseAllow(): void }).releaseAllow());
  await adding;
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
});

for (const ending of ['pointerup', 'Escape', 'blur'] as const) test(`R-16 境界ドラッグ中の別コマンドはプレビューを取り消して1操作だけ記録する ${ending}`, async ({ split, sw }) => {
  await openUrl(split, 0, site('a', '/plain?drag-close'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const original = await pane(split, 0).boundingBox();
  const box = (await split.getByRole('button', { name: '左右の境界', exact: true }).first().boundingBox())!;
  await split.mouse.move(box.x + 4, box.y + 20); await split.mouse.down();
  await split.mouse.move(box.x + 90, box.y + 20, { steps: 3 });
  await command(sw, split, 'close-pane');
  if (ending === 'Escape') await split.keyboard.press('Escape');
  if (ending === 'blur') await split.evaluate(() => window.dispatchEvent(new Event('blur')));
  await split.mouse.up();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(await pane(split, 0).boundingBox()).toEqual(original);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
});

test('R-16 同じURLの枠もUndoで非表示に戻ればフレームを破棄し続けて追加できる', async ({ split, sw }) => {
  const saved = site('a', '/plain?saved-url');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await openUrl(split, 4, saved);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const add = () => sw.evaluate(async url => (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string }): Promise<boolean> } }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: url }), site('b', '/page2?insert'));
  expect(await add()).toBe(true);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await openUrl(split, 4, saved);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.locator('.pane[hidden] iframe')).toHaveCount(0);
  expect(await add()).toBe(true);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

test('R-19 アドレス欄の標準右クリックを保ち番号には削除メニューを出す', async ({ split }) => {
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await split.evaluate(() => document.addEventListener('contextmenu', event => {
    if (event.target instanceof HTMLInputElement) document.body.dataset.addressMenuPrevented = String(event.defaultPrevented);
  }));
  await input.click({ button: 'right' });
  await expect(split.locator('body')).toHaveAttribute('data-address-menu-prevented', 'false');
  await expect(split.getByRole('menu')).toBeHidden();
  await split.keyboard.press('Escape');
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await expect(split.getByRole('menuitem', { name: 'タブを削除', exact: true })).toBeVisible();
});

test('R-17 最大化中の分割は元の枠の長辺を使い新しい枠を表示する', async ({ split, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: '横並び', exact: false }).click();
  const original = (await pane(split, 0).boundingBox())!;
  expect(original.height).toBeGreaterThan(original.width);
  await pane(split, 0).locator('.pane-number').dblclick();
  await command(sw, split, 'split-add');
  await expect(pane(split, 3)).toBeVisible();
  const first = (await pane(split, 0).boundingBox())!, added = (await pane(split, 3).boundingBox())!;
  expect(added.x).toBe(first.x); expect(added.y).toBeGreaterThan(first.y);
});

// R-19 (0.1.93f): a normal new tab is not captured, so it splits nothing; the layout and the other page stay.
test('R-19 R-11 新規タブで開いたリンクは枠を分割せず、配置と元のページを保つ', async ({ split, context }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: '横並び', exact: false }).click();
  await openUrl(split, 1, site('a', `/link?new=1&to=${encodeURIComponent(site('b', '/page2?from-second'))}`));
  await openUrl(split, 0, site('a', '/token?keep-first'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const original = await pane(split, 0).boundingBox();
  const opened = context.waitForEvent('page');
  await clickInFrame(pane(split, 1).frameLocator('iframe').getByTestId('link'));
  const tab = await opened;
  await expect(tab).toHaveURL(site('b', '/page2?from-second'));
  await split.waitForTimeout(500);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  expect(await pane(split, 0).boundingBox()).toEqual(original);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  expect(tab.isClosed()).toBe(false);
});
