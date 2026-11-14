import { test, expect, pane, openUrl, site, moveIntoFrame, createNewView } from './fixtures';

type MenuInfo = { menuItemId: string; pageUrl?: string; linkUrl?: string };
type Hooks = { handleContextMenu(info: MenuInfo): Promise<boolean> };
test('R-11 S-06 右クリック相当の処理で未起動なら分割タブを開き URL を追加する', async ({ context, sw, extensionId }) => {
  expect(await sw.evaluate(info => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu(info), { menuItemId: 'split8-link', linkUrl: 'javascript:alert(1)' })).toBe(false);
  expect(context.pages().filter(page => page.url().includes('/split.html'))).toHaveLength(0);
  expect(await sw.evaluate(info => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu(info), { menuItemId: 'split8-page', pageUrl: site('a', '/plain') })).toBe(true);
  await expect.poll(() => context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))?.url()).toBeTruthy();
  const split = context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))!;
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect.poll(() => split.url()).not.toContain('?add=');
});
test('R-11 追加ごとに表示数を増やし満杯なら追加しない', async ({ split, sw }) => {
  const add = (url: string) => sw.evaluate(value => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: value }), url);
  for (let i = 0; i < 4; i++) {
    expect(await add(site('a', `/plain?pane=${i}`))).toBe(true);
    await expect(pane(split, i + 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
  expect(await add(site('a', '/page2'))).toBe(true);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('9');
  await expect(pane(split, 8).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('12'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  for (let i = 0; i < 12; i++) {
    if (i >= 4 && i <= 8) continue;
    await openUrl(split, i, site('a', `/plain?pane=${i}`));
    await expect(pane(split, i).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
  expect(await add(site('b', '/plain'))).toBe(false);
  await expect(split.getByRole('status')).toHaveText('空いているペインがありません');
  await expect(pane(split, 8).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
test('R-11 隠したページを保持し新規追加では表示数を1だけ増やす', async ({ split, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('7'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await openUrl(split, 4, site('a', '/link?saved=4'));
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('link')).toBeVisible();
  await moveIntoFrame(split, 4);
  await pane(split, 4).frameLocator('iframe').getByTestId('link').click();
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  for (const index of [5, 6]) {
    await openUrl(split, index, site('a', `/plain?saved=${index}`));
    await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const added = await sw.evaluate(value => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: value }), site('b', '/page2'));
  expect(added).toBe(true);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('8'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(pane(split, 5).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  // R-83: this pane is 160px wide, so its header hides 戻る and the pane menu offers the same page-back action.
  await pane(split, 5).getByRole('button', { name: '枠のメニュー' }).click();
  await split.getByRole('menu', { name: '枠の操作' }).getByRole('menuitem', { name: '戻る', exact: true }).click();
  await expect(pane(split, 5).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  for (const index of [6, 7]) {
    await expect(pane(split, index).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', `/plain?saved=${index - 1}`));
    await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
});
test('R-11 隠したページを移動して追加した状態は更新後も復元する', async ({ split, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('7'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  for (const index of [4, 5, 6]) {
    await openUrl(split, index, site('a', `/plain?saved=${index}`));
    await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  expect(await sw.evaluate(value => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: value }), site('b', '/page2'))).toBe(true);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    return (workspace as { panes: Array<{ url: string }> }).panes[7]?.url;
  })).toBe(site('a', '/plain?saved=6'));
  await split.reload();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('8'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  for (const index of [5, 6, 7]) {
    await expect(pane(split, index).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', `/plain?saved=${index - 1}`));
    await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
});
test('R-12 開いている http タブを選択して別々のペインに追加する', async ({ split, context }) => {
  const first = await context.newPage(); await first.goto(site('a', '/plain'));
  const second = await context.newPage(); await second.goto(site('b', '/page2'));
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '開いているタブから追加' }).click();
  const dialog = split.getByRole('dialog');
  await expect(dialog.getByText('chrome-extension://', { exact: false })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: /Fixture \/plain/ }).check();
  await dialog.getByRole('checkbox', { name: /Fixture \/page2/ }).check();
  await dialog.getByRole('button', { name: '選んだタブを追加' }).click();
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 5).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
test('R-13 ペインごとの表示倍率を変更し更新後も復元する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(split, 0).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 0).getByRole('button', { name: '67%' }).click();
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('67%');
  await expect(pane(split, 0).locator('iframe')).toHaveCSS('transform', 'matrix(0.67, 0, 0, 0.67, 0, 0)');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await split.reload();
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('67%');
  await expect(pane(split, 0).locator('iframe')).toHaveCSS('transform', 'matrix(0.67, 0, 0, 0.67, 0, 0)');
});
test('R-05 R-30 最大化は他のページを保持しエラー時の新規タブとクリアも使える', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/token'));
  await openUrl(split, 1, site('b', '/token'));
  const first = pane(split, 0).frameLocator('iframe').getByTestId('token');
  const second = pane(split, 1).frameLocator('iframe').getByTestId('token');
  await expect(first).toBeVisible(); await expect(second).toBeVisible();
  const previous = await second.textContent();
  await pane(split, 0).locator('.pane-number').dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await pane(split, 0).locator('.pane-number').dblclick();
  await expect(second).toHaveText(previous!);
  // The header shortcut was removed in R-30; the existing explicit error recovery remains.
  await context.route(site('a', '/token'), route => route.abort('failed'));
  await pane(split, 0).getByRole('button', { name: '再読み込み' }).click();
  await expect(pane(split, 0).getByText(/読み込みに失敗しました/)).toBeVisible();
  await context.unroute(site('a', '/token'));
  const newTab = context.waitForEvent('page');
  // The error card's button; the header arrow is named 「このページを新しいタブで開く」 (R-45).
  await pane(split, 0).getByRole('button', { name: '新しいタブで開く', exact: true }).click();
  const opened = await newTab;
  await expect(opened).toHaveURL(site('a', '/token'));
  // R-15 changes × to remove the pane. The explicit clear action retains R-05's original empty-pane contract.
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: 'この枠を空にする' }).click();
  await expect(pane(split, 0).locator('.empty')).toBeVisible();
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
});
test('S-06 boot ページは http と https 以外に遷移しない', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const boot = `chrome-extension://${extensionId}/pane-boot.html?to=${encodeURIComponent('data:text/html,unsafe')}`;
  await page.goto(boot);
  await expect(page).toHaveURL(boot);
});
test('外部から表示中のページに URL をドラッグして開き、キャンセル後は操作を戻す', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const box = await pane(split, 0).locator('iframe').boundingBox();
  if (!box) throw new Error('iframe is not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  // A further drag-enter targets the shield that appeared above the frame.
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: x + 5, y: y + 5, data });
  // R-79: a URL on a loaded page adds a pane beside it instead of replacing the page.
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x, y, data });
  await expect(split.locator('#app')).not.toHaveClass(/dragging/, { timeout: 5000 });
  await cdp.detach();
});
test('入れ子のページへ外部からドラッグしても URL を開ける', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/nested?src=${encodeURIComponent(site('b', '/plain'))}`));
  const child = pane(split, 0).frameLocator('iframe').frameLocator('iframe');
  await expect(child.getByTestId('marker')).toHaveText('plain');
  const box = await pane(split, 0).frameLocator('iframe').locator('iframe').boundingBox();
  if (!box) throw new Error('nested iframe is not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('a', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: x + 5, y: y + 5, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('parent');
  await cdp.detach();
});
test('ページ内リンクを長めに保持してから別ペインへドラッグできる', async ({ split }) => {
  await openUrl(split, 1, site('b', '/plain'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = await link.boundingBox();
  const target = await pane(split, 1).locator('.pane-view').boundingBox();
  if (!source || !target) throw new Error('drag source or target is not visible');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  // R-80: a link inside a pane is dragged by emulation; the ghost label marks the active drag.
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.waitForTimeout(2500);
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await split.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2);
  await split.mouse.up();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});
test('ページ内リンクのドラッグを Escape で中止したら受け取り状態を解除する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await expect(split.locator('.link-drag-ghost')).toBeHidden();
  await expect(split.locator('#app')).not.toHaveClass(/number-dragging/);
  await split.waitForTimeout(1000);
  await expect(split.locator('#app')).not.toHaveClass(/number-dragging/);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});
test('ページ内リンクを画面外へドラッグして中止しても操作できる', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.mouse.move(-10, -10, { steps: 20 });
  await split.mouse.up();
  await expect(split.locator('.link-drag-ghost')).toBeHidden({ timeout: 5000 });
  await expect(split.locator('#app')).not.toHaveClass(/number-dragging/);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toBeEnabled();
});
test('入れ子ページのリンクを保持してから別ペインへドラッグできる', async ({ split }) => {
  await openUrl(split, 1, site('a', '/plain'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await openUrl(split, 0, site('a', `/nested?src=${encodeURIComponent(site('b', '/link'))}`));
  const link = pane(split, 0).frameLocator('iframe').frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  const source = await link.boundingBox();
  const target = await pane(split, 1).locator('.pane-view').boundingBox();
  if (!source || !target) throw new Error('drag source or target is not visible');
  await moveIntoFrame(split, 0);
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2, { steps: 20 });
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  // R-80: a nested frame cannot be mapped by the view, so the drag starts on the worker-verified announcement.
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.waitForTimeout(2500);
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await split.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2);
  await split.mouse.up();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(split.locator('#app')).not.toHaveClass(/number-dragging/);
});
test('入れ子ページのドラッグ中止後は操作を戻す', async ({ split }) => {
  await openUrl(split, 0, site('a', `/nested?src=${encodeURIComponent(site('b', '/link'))}`));
  const link = pane(split, 0).frameLocator('iframe').frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await moveIntoFrame(split, 0);
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2, { steps: 20 });
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
  await split.waitForTimeout(1000);
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
});
test('外部 URL を表示中ペインへ長めに保持してドロップできる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const box = await pane(split, 0).locator('iframe').boundingBox();
  if (!box) throw new Error('iframe is not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 5, y: y + 5, data });
  await split.waitForTimeout(2500);
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: x + 5, y: y + 5, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await cdp.detach();
});
test('外部 URL を表示中ペインで中止して終了通知がなくても、次のポインター操作で受け取り状態を解除する', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const box = await pane(split, 0).locator('iframe').boundingBox();
  if (!box) throw new Error('iframe is not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await split.mouse.move(x - 40, y - 40);
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 5, y: y + 5, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: x + 5, y: y + 5, data });
  await cdp.detach();
  // The cancel above reaches this page without any end event, so only the pointer can clear it.
  await split.waitForTimeout(300);
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await split.mouse.move(x + 20, y + 20, { steps: 4 });
  await expect(split.locator('#app')).not.toHaveClass(/dragging/, { timeout: 1000 });
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});
test('外部 URL の保持中に継続イベントが届けばドロップできる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const box = await pane(split, 0).locator('iframe').boundingBox();
  if (!box) throw new Error('iframe is not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 5, y: y + 5, data });
  for (let i = 0; i < 7; i++) {
    await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 5, y: y + 5, data });
    await split.waitForTimeout(400);
  }
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: x + 5, y: y + 5, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await cdp.detach();
});
test('遅れて届いたドラッグ開始通知で操作が再び塞がれない', async ({ split, sw }) => {
  await sw.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'pane/drag-state') {
        return new Promise(resolve => setTimeout(() => { void original(message).then(resolve); }, 1200));
      }
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
  await split.waitForTimeout(1600);
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
});
test('入れ子ページのドラッグ通知は他の分割ビューを塞がない', async ({ split, context }) => {
  const opened = context.waitForEvent('page');
  await createNewView(split);
  const second = await opened;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await split.bringToFront();
  await openUrl(split, 0, site('a', `/nested?src=${encodeURIComponent(site('b', '/link'))}`));
  const link = pane(split, 0).frameLocator('iframe').frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await moveIntoFrame(split, 0);
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2, { steps: 20 });
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await split.waitForTimeout(500);
  await expect(second.locator('#app')).not.toHaveClass(/dragging/);
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
  await expect(second.locator('#app')).not.toHaveClass(/dragging/);
});
test('通常タブのドラッグは分割ビューを塞がない', async ({ split, context }) => {
  const normal = await context.newPage();
  await normal.goto(site('a', '/link'));
  const link = normal.getByTestId('link');
  await expect(link).toBeVisible();
  await normal.evaluate(() => { document.addEventListener('dragstart', event => { if (event.isTrusted) document.body.dataset.realDrag = 'started'; }); });
  const source = await link.boundingBox();
  if (!source) throw new Error('drag source is not visible');
  await normal.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await normal.mouse.down();
  await normal.mouse.move(source.x + source.width / 2 + 20, source.y + source.height / 2 + 20, { steps: 4 });
  await expect(normal.locator('body')).toHaveAttribute('data-real-drag', 'started');
  await normal.waitForTimeout(500);
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
  await normal.keyboard.press('Escape');
  await normal.mouse.up();
  await expect(split.locator('#app')).not.toHaveClass(/dragging/);
});
test('ページの擬似ドラッグ終了は利用者のドラッグを中断しない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = await link.boundingBox();
  const target = await pane(split, 1).locator('.pane-view').boundingBox();
  if (!source || !target) throw new Error('drag source or target is not visible');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await link.evaluate(element => element.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  await split.waitForTimeout(500);
  expect(await split.locator('#app').getAttribute('class')).toContain('dragging');
  await split.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await split.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2);
  await split.mouse.up();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
test('ページの準備中に分割数を減らしても非表示枠で読み込まない', async ({ split, sw }) => {
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    (window as typeof window & { releaseAllow: () => void }).releaseAllow = release;
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add') return gate.then(() => original(message));
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(split, 3, site('a', '/plain?hidden=1'));
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('1'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.evaluate(() => (window as typeof window & { releaseAllow: () => void }).releaseAllow());
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    return (workspace as { panes: Array<{ url: string }> }).panes[3]?.url;
  })).toBe(site('a', '/plain?hidden=1'));
  await expect(pane(split, 3).locator('iframe')).toHaveCount(0);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(pane(split, 3).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});
test('同じ枠へ続けて入力したら遅れた古い URL で上書きしない', async ({ split }) => {
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const state = window as typeof window & { releaseFirst: () => void; firstFinished: boolean };
    state.releaseFirst = release; state.firstFinished = false;
    let first = true;
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add' && first) {
        first = false;
        return gate.then(() => original(message)).then(result => { state.firstFinished = true; return result; });
      }
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(split, 0, site('a', '/plain?first=1'));
  await openUrl(split, 0, site('b', '/page2?second=1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.evaluate(() => (window as typeof window & { releaseFirst: () => void }).releaseFirst());
  await expect.poll(() => split.evaluate(() => (window as typeof window & { firstFinished: boolean }).firstFinished)).toBe(true);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/page2?second=1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
test('ページの準備中に枠をクリアしたら遅れて復活しない', async ({ split }) => {
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const state = window as typeof window & { releaseFirst: () => void; firstFinished: boolean };
    state.releaseFirst = release; state.firstFinished = false;
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add') return gate.then(() => original(message)).then(result => { state.firstFinished = true; return result; });
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await openUrl(split, 0, site('a', '/plain?pending=1'));
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: 'この枠を空にする' }).click();
  await split.evaluate(() => (window as typeof window & { releaseFirst: () => void }).releaseFirst());
  await expect.poll(() => split.evaluate(() => (window as typeof window & { firstFinished: boolean }).firstFinished)).toBe(true);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('');
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
});
// R-11 (0.1.93f): a link that opens a new tab is not captured, so no allowlist request or pane is prepared for it.
test('R-11 新規タブで開いたページは許可待ちも枠も作らず、元のタブを保持する', async ({ split, context }) => {
  const url = site('b', '/page2?hidden=1');
  await openUrl(split, 0, site('a', `/link?new=1&to=${encodeURIComponent(url)}`));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    const state = window as typeof window & { allowWaiting: boolean };
    state.allowWaiting = false;
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add') state.allowWaiting = true;
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  await moveIntoFrame(split, 0);
  const opened = context.waitForEvent('page');
  await link.click();
  const original = await opened;
  await expect(original).toHaveURL(url);
  await split.waitForTimeout(1000);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(await split.evaluate(() => (window as typeof window & { allowWaiting: boolean }).allowWaiting)).toBe(false);
  await expect(pane(split, 4)).toBeHidden();
  expect(original.isClosed()).toBe(false);
});
test('R-09 R-11 準備中の枠を隠して追加しても両方の URL を保持する', async ({ split, sw }) => {
  await split.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const state = window as typeof window & { releaseFirst: () => void; firstFinished: boolean };
    state.releaseFirst = release; state.firstFinished = false;
    let first = true;
    chrome.runtime.sendMessage = ((message: unknown) => {
      if ((message as { type?: string })?.type === 'allowlist/add' && first) {
        first = false;
        return gate.then(() => original(message)).then(result => { state.firstFinished = true; return result; });
      }
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  const saved = site('a', '/plain?pending=1');
  const added = site('b', '/page2?added=1');
  await openUrl(split, 3, saved);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  expect(await sw.evaluate(value => (globalThis as typeof globalThis & { __split8Test: Hooks }).__split8Test.handleContextMenu({ menuItemId: 'split8-link', linkUrl: value }), added)).toBe(true);
  await expect(pane(split, 3).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    return (workspace as { panes: Array<{ url: string }> }).panes.slice(3, 5).map(pane => pane.url);
  })).toEqual([added, saved]);
  await split.evaluate(() => (window as typeof window & { releaseFirst: () => void }).releaseFirst());
  await expect.poll(() => split.evaluate(() => (window as typeof window & { firstFinished: boolean }).firstFinished)).toBe(true);
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(pane(split, 3).getByRole('combobox', { name: 'アドレス' })).toHaveValue(added);
  await expect(pane(split, 4).getByRole('combobox', { name: 'アドレス' })).toHaveValue(saved);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    const state = workspace as { count: number; panes: Array<{ url: string }> };
    return { count: state.count, urls: state.panes.slice(3, 5).map(pane => pane.url) };
  })).toEqual({ count: 5, urls: [added, saved] });
  await split.reload();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 3).getByRole('combobox', { name: 'アドレス' })).toHaveValue(added);
  await expect(pane(split, 3).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 4).getByRole('combobox', { name: 'アドレス' })).toHaveValue(saved);
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});
