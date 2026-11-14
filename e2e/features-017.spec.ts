import { test, expect, openUrl, pane, site, createNewView } from './fixtures';
import type { Locator } from '@playwright/test';

async function clickHovered(target: Locator): Promise<void> {
  await expect.poll(async () => {
    // Chromium can leave the pointer on the parent; re-enter until the child receives hover.
    await target.page().mouse.move(1, 1);
    await target.hover();
    return target.evaluate(element => element.matches(':hover'));
  }).toBe(true);
  await target.click();
}

test('R-24 固定と選択を分離し数字の右クリックで固定しても選択を変えない', async ({ split }) => {
  const first = pane(split, 0), second = pane(split, 1), third = pane(split, 2);
  await expect(first).toHaveClass(/fixed/);
  await second.getByRole('combobox', { name: 'アドレス' }).click();
  await expect(second).toHaveClass(/active/);
  await expect(first).toHaveClass(/fixed/);
  await third.locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await expect(third).toHaveClass(/fixed/);
  await expect(second).toHaveClass(/active/);
  await expect(first).not.toHaveClass(/fixed/);
  await split.getByRole('button', { name: /右に追加/ }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  const target = (await third.boundingBox())!, newPane = (await pane(split, 4).boundingBox())!;
  expect(newPane.x).toBeGreaterThan(target.x);
  await expect(second).toHaveClass(/active/);
});

test('R-24 ページ本文のクリックで選択を移し固定は維持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain?select=first'));
  await openUrl(split, 1, site('b', '/plain?select=second'));
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  const marker = pane(split, 1).frameLocator('iframe').getByTestId('marker');
  await clickHovered(marker);
  await expect(pane(split, 1)).toHaveClass(/active/);
  await expect(pane(split, 0)).toHaveClass(/fixed/);
});

test('R-25 交差点をドラッグすると二方向が同時に変わりUndo一回で戻る', async ({ split }) => {
  const frame = pane(split, 0);
  await openUrl(split, 0, site('a', '/token?corner'));
  const token = await frame.frameLocator('iframe').getByTestId('token').textContent();
  const old = (await frame.boundingBox())!;
  const handle = split.getByRole('button', { name: '境界の交点', exact: true }).first();
  const box = (await handle.boundingBox())!;
  await split.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await split.mouse.down();
  await split.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 45, { steps: 6 }); await split.mouse.up();
  const after = (await frame.boundingBox())!;
  expect(after.width).toBeGreaterThan(old.width + 40); expect(after.height).toBeGreaterThan(old.height + 25);
  await expect(frame.frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await frame.boundingBox()).toEqual(old);
});

test('R-26 選択した枠の倍率だけ10%ずつキーとメニューで変え保存する', async ({ split }) => {
  await pane(split, 1).getByRole('combobox', { name: 'アドレス' }).click();
  await split.keyboard.press('Meta+Shift+=');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await pane(split, 1).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 1).getByRole('button', { name: '120%', exact: true }).click();
  await split.keyboard.press('Meta+Shift+-');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await split.reload();
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
});

for (const [direction, axis, sign] of [['右', 'x', 1], ['左', 'x', -1], ['下', 'y', 1], ['上', 'y', -1]] as const) test(`R-24 固定枠を基準に${direction}へ追加して選択枠は変えない`, async ({ split }) => {
  const anchor = pane(split, 1), selected = pane(split, 0);
  await selected.getByRole('combobox', { name: 'アドレス' }).click();
  await anchor.locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await split.getByRole('button', { name: new RegExp(`${direction}に追加`) }).click();
  const target = (await anchor.boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect((axis === 'x' ? added.x - target.x : added.y - target.y) * sign).toBeGreaterThan(0);
  await expect(anchor).toHaveClass(/fixed/); await expect(selected).toHaveClass(/active/);
});

test('R-24 固定枠と選択枠を別に保持し固定した枠の閉鎖や復元後も有効な対象を指す', async ({ split }) => {
  await pane(split, 1).getByRole('combobox', { name: 'アドレス' }).click();
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await split.reload();
  await expect(pane(split, 2)).toHaveClass(/fixed/);
  await expect(pane(split, 0)).toHaveClass(/active/);
  await pane(split, 2).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(split.locator('.pane.fixed:visible')).toHaveCount(1);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.locator('.pane.fixed:visible')).toHaveCount(1);
});

test('R-25 境界線の通常ドラッグは一方向のみ、交差点はEscapeで両方取り消す', async ({ split }) => {
  const first = pane(split, 0), initial = (await first.boundingBox())!;
  const line = split.getByRole('button', { name: '左右の境界', exact: true }).first();
  const edge = (await line.boundingBox())!;
  await split.mouse.move(edge.x + edge.width / 2, edge.y + 40); await split.mouse.down();
  await split.mouse.move(edge.x + edge.width / 2 + 40, edge.y + 75, { steps: 4 }); await split.mouse.up();
  const moved = (await first.boundingBox())!;
  expect(moved.width).toBeGreaterThan(initial.width + 20); expect(moved.height).toBeCloseTo(initial.height, 0);
  const corner = (await split.getByRole('button', { name: '境界の交点', exact: true }).first().boundingBox())!;
  await split.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await split.mouse.down();
  await split.mouse.move(corner.x + corner.width / 2 + 35, corner.y + corner.height / 2 + 35, { steps: 4 });
  await split.keyboard.press('Escape'); await split.mouse.up();
  expect(await first.boundingBox()).toEqual(moved);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await first.boundingBox()).toEqual(initial);
});

test('R-24 入れ子のサイトを操作すると親枠を選択し、偽の入力と通常タブは影響しない', async ({ split, context }) => {
  await openUrl(split, 1, site('b', '/frame?src=%2Fplain%3Fnested'));
  const child = pane(split, 1).frameLocator('iframe').frameLocator('iframe[title="child"]').getByTestId('marker');
  await clickHovered(child);
  await expect(pane(split, 1)).toHaveClass(/active/);
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await child.evaluate(el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
  await split.waitForTimeout(150);
  await expect(pane(split, 0)).toHaveClass(/active/);
  const normal = await context.newPage();
  await normal.goto(site('a', '/frame?src=%2Fplain%3Fnormal'));
  const normalChild = normal.frameLocator('iframe').getByTestId('marker');
  await clickHovered(normalChild);
  await split.bringToFront();
  await expect(pane(split, 0)).toHaveClass(/active/);
  await expect(pane(split, 0)).toHaveClass(/fixed/);
});

for (const ending of ['pointercancel', 'blur'] as const) test(`R-25 交点ドラッグを${ending}で両軸とも取り消す`, async ({ split }) => {
  const before = (await pane(split, 0).boundingBox())!;
  const point = (await split.getByRole('button', { name: '境界の交点', exact: true }).first().boundingBox())!;
  await split.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await split.mouse.down();
  await split.mouse.move(point.x + point.width / 2 + 45, point.y + point.height / 2 + 35, { steps: 4 });
  if (ending === 'pointercancel') await split.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
  else await split.evaluate(() => window.dispatchEvent(new Event('blur')));
  await split.mouse.up();
  expect(await pane(split, 0).boundingBox()).toEqual(before);
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
});

test('R-25 3＋1配置のT字交点で横と縦を動かし、一方の端でも他方は動く', async ({ split }) => {
  await split.getByRole('button', { name: '3＋1', exact: true }).click();
  const before = (await pane(split, 0).boundingBox())!, bottom = (await pane(split, 3).boundingBox())!;
  const corner = split.getByRole('button', { name: '境界の交点', exact: true });
  await expect(corner).toHaveCount(2);
  const point = (await corner.first().boundingBox())!;
  await split.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await split.mouse.down();
  await split.mouse.move(point.x + point.width / 2 - 10000, point.y + point.height / 2 + 35, { steps: 4 }); await split.mouse.up();
  const after = (await pane(split, 0).boundingBox())!, bottomAfter = (await pane(split, 3).boundingBox())!;
  expect(after.width).toBeLessThan(before.width); expect(after.width).toBeGreaterThan(0);
  expect(bottomAfter.y).toBeGreaterThan(bottom.y + 20);
});

test('R-24 R-25 R-26 固定・本文選択・二軸リサイズ・倍率・Undoを続けても対象はずれない', async ({ split, sw }) => {
  await openUrl(split, 1, site('b', '/frame?src=%2Fplain%3Fcombined'));
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  const child = pane(split, 1).frameLocator('iframe').frameLocator('iframe[title="child"]').getByTestId('marker');
  await clickHovered(child);
  await expect(pane(split, 1)).toHaveClass(/active/);
  await split.keyboard.press('Meta+Shift+=');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  const original = (await pane(split, 0).boundingBox())!;
  const point = (await split.getByRole('button', { name: '境界の交点', exact: true }).first().boundingBox())!;
  await split.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await split.mouse.down();
  await split.mouse.move(point.x + point.width / 2 + 30, point.y + point.height / 2 + 25, { steps: 4 }); await split.mouse.up();
  await pane(split, 3).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await expect(pane(split, 1)).toHaveClass(/active/); await expect(pane(split, 3)).toHaveClass(/fixed/);
  await split.getByRole('button', { name: /右に追加/ }).click();
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await pane(split, 0).boundingBox()).toEqual(original);
  await expect(pane(split, 0)).toHaveClass(/active/); await expect(pane(split, 3)).toHaveClass(/fixed/);
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  expect(await split.evaluate(async () => chrome.tabs.getZoom((await chrome.tabs.getCurrent())!.id!))).toBe(1);
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    const state = workspace as { fixedSlot: number; panes: Array<{ zoom: number }> };
    return [state.fixedSlot, state.panes[1]!.zoom, state.panes[0]!.zoom];
  })).toEqual([3, 1.1, 1]);
  await split.reload();
  await expect(pane(split, 3)).toHaveClass(/fixed/);
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
});

test('R-26 旧67%から10ポイント変更し現在値をメニューと保存に反映する', async ({ split }) => {
  const target = pane(split, 1);
  await target.getByRole('button', { name: '表示倍率' }).click();
  await target.getByRole('button', { name: '67%', exact: true }).click();
  await split.keyboard.press('Meta+Shift+=');
  await expect(target.getByRole('button', { name: '表示倍率' })).toHaveText('77%');
  await target.getByRole('button', { name: '表示倍率' }).click();
  await expect(target.getByRole('button', { name: '77%', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await split.reload();
  await expect(target.getByRole('button', { name: '表示倍率' })).toHaveText('77%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
});

test('R-24 選択していない固定枠の削除とUndo/Redoで選択や後から固定した枠を戻さない', async ({ split }) => {
  await pane(split, 1).getByRole('combobox', { name: 'アドレス' }).click();
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: 'タブを削除', exact: true }).click();
  await expect(pane(split, 1)).toHaveClass(/active/); await expect(split.locator('.pane[data-slot="3"]')).toHaveClass(/fixed/);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 2)).toHaveClass(/fixed/); await expect(pane(split, 1)).toHaveClass(/active/);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 0)).toHaveClass(/fixed/); await expect(pane(split, 1)).toHaveClass(/active/);
});

test('R-24 明示的なリンク方向指定はリンク元ではなく固定枠を分割する', async ({ split, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: '横並び' }).click();
  const sourceUrl = site('a', '/link?direction=source');
  await openUrl(split, 1, sourceUrl);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('link')).toBeVisible();
  const unchanged = await pane(split, 1).boundingBox();
  const url = site('b', '/page2?direction=target');
  expect(await sw.evaluate(async ({ sourceUrl, url }) => {
    const tab = (await chrome.tabs.query({})).find(item => item.url?.endsWith('/split.html'))!;
    const frame = (await chrome.webNavigation.getAllFrames({ tabId: tab.id! }))!.find(item => item.url === sourceUrl)!;
    const hooks = (globalThis as unknown as { __split8Test: { handleContextMenu(info: { menuItemId: string; linkUrl: string; frameId: number }, tab: chrome.tabs.Tab): Promise<boolean> } }).__split8Test;
    return hooks.handleContextMenu({ menuItemId: 'split8-link-x', linkUrl: url, frameId: frame.frameId }, tab);
  }, { sourceUrl, url })).toBe(true);
  await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  expect(await pane(split, 1).boundingBox()).toEqual(unchanged);
  const fixed = (await pane(split, 0).boundingBox())!, added = (await pane(split, 2).boundingBox())!;
  expect(added.x).toBeGreaterThan(fixed.x); expect(added.x + added.width).toBeLessThanOrEqual(unchanged!.x + 1);
  await expect(pane(split, 0)).toHaveClass(/fixed/); await expect(pane(split, 1)).toHaveClass(/active/);
});

test('R-24 遅れて届いたページ内クリック通知は新しい選択を上書きしない', async ({ split, sw }) => {
  await openUrl(split, 1, site('b', '/plain?delayed-activation'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await sw.evaluate(() => {
    const state = globalThis as unknown as { heldActivation: boolean; releaseActivation(): void };
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    let release: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    state.heldActivation = false; state.releaseActivation = () => release();
    chrome.runtime.sendMessage = ((message: { type?: string }) => {
      if (message.type === 'pane/activate') { state.heldActivation = true; return gate.then(() => original(message)); }
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  const marker = pane(split, 1).frameLocator('iframe').getByTestId('marker');
  await clickHovered(marker);
  await expect.poll(() => sw.evaluate(() => (globalThis as unknown as { heldActivation: boolean }).heldActivation)).toBe(true);
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await sw.evaluate(() => (globalThis as unknown as { releaseActivation(): void }).releaseActivation());
  await expect(pane(split, 0)).toHaveClass(/active/);
  await split.waitForTimeout(150);
  await expect(pane(split, 0)).toHaveClass(/active/);
});

test('R-24 R-26 各ビューの固定枠と倍率は独立して保存される', async ({ split, context }) => {
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await pane(split, 1).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 1).getByRole('button', { name: '120%', exact: true }).click();
  const opened = context.waitForEvent('page');
  await createNewView(split);
  const second = await opened;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(second, 0)).toHaveClass(/fixed/);
  await pane(second, 1).locator('.pane-number').click({ button: 'right' });
  await second.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await pane(second, 2).getByRole('button', { name: '表示倍率' }).click();
  await pane(second, 2).getByRole('button', { name: '80%', exact: true }).click();
  await split.bringToFront(); await split.reload();
  await expect(pane(split, 2)).toHaveClass(/fixed/);
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('120%');
  await second.bringToFront(); await second.reload();
  await expect(pane(second, 1)).toHaveClass(/fixed/);
  await expect(pane(second, 2).getByRole('button', { name: '表示倍率' })).toHaveText('80%');
});

test('R-26 狭い画面でも倍率メニューを画面内に広く表示し範囲の端を選べる', async ({ split }, testInfo) => {
  await split.setViewportSize({ width: 640, height: 560 });
  await pane(split, 3).getByRole('button', { name: '表示倍率' }).click();
  const menu = pane(split, 3).locator('.zoom-menu'), rect = (await menu.boundingBox())!;
  expect(rect.width).toBeGreaterThanOrEqual(170);
  expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(640);
  expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(560);
  await split.screenshot({ path: testInfo.outputPath('017-zoom-menu.png') });
  await menu.getByRole('button', { name: '300%', exact: true }).click();
  await expect(pane(split, 3).getByRole('button', { name: '表示倍率' })).toHaveText('300%');
});

test('R-24 R-26 未来の通知に選択が固着せず古いキー操作は元の枠だけに作用する', async ({ split, sw }) => {
  const urls = [site('a', '/plain?clock=first'), site('b', '/plain?clock=second')];
  await openUrl(split, 0, urls[0]!); await openUrl(split, 1, urls[1]!);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const ids = await sw.evaluate(async urls => {
    const tab = (await chrome.tabs.query({})).find(item => item.url?.endsWith('/split.html'))!;
    const frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id! }))!;
    return { tabId: tab.id!, frames: urls.map(url => frames.find(frame => frame.url === url)!.frameId) };
  }, urls);
  await sw.evaluate(async ids => {
    await chrome.runtime.sendMessage({ type: 'pane/activate', tabId: ids.tabId, frameId: ids.frames[1], at: Date.now() + 60000 });
  }, ids);
  await expect(pane(split, 1)).toHaveClass(/active/);
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await expect(pane(split, 0)).toHaveClass(/active/);
  await sw.evaluate(async ids => {
    await chrome.runtime.sendMessage({ type: 'app/action', tabId: ids.tabId, frameId: ids.frames[1], at: Date.now() - 10000, action: 'zoom-in' });
  }, ids);
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await expect(pane(split, 0)).toHaveClass(/active/);
});

test('R-24 追加後に新しい枠を固定してUndo/Redoすると固定先も対応する枠に戻る', async ({ split }) => {
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await split.getByRole('button', { name: /右に追加/ }).click();
  await pane(split, 4).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await expect(pane(split, 4)).toHaveClass(/fixed/);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(pane(split, 2)).toHaveClass(/fixed/);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await expect(pane(split, 4)).toHaveClass(/fixed/);
});

test('R-25 交点付近の線ではShift選択とダブルクリック反転を維持する', async ({ split }) => {
  const point = (await split.getByRole('button', { name: '境界の交点', exact: true }).boundingBox())!;
  const x = point.x + point.width / 2, y = point.y + point.height / 2;
  const vertical = split.getByRole('button', { name: '左右の境界', exact: true });
  const horizontal = split.getByRole('button', { name: '上下の境界', exact: true });
  await split.keyboard.down('Shift'); await split.mouse.click(x, y + 6); await split.keyboard.up('Shift');
  await expect(vertical.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(vertical.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await split.keyboard.press('Escape');
  await split.keyboard.down('Shift'); await split.mouse.click(x + 6, y); await split.keyboard.up('Shift');
  await expect(horizontal.first()).toHaveAttribute('aria-pressed', 'true');
  await split.keyboard.press('Escape');
  const before = (await pane(split, 0).boundingBox())!;
  await split.mouse.dblclick(x + 6, y);
  expect((await pane(split, 0).boundingBox())!.y).toBeGreaterThan(before.y);
});

test('R-26 キー長押しと設定画面では余分なブラウザ倍率操作を抑止する', async ({ split }) => {
  await split.evaluate(() => {
    document.addEventListener('keydown', event => {
      if (event.metaKey && event.shiftKey && event.code === 'Equal') document.body.dataset.zoomKeyDefaultPrevented = String(event.defaultPrevented);
    });
  });
  await split.keyboard.down('Meta'); await split.keyboard.down('Shift');
  await split.keyboard.down('='); await split.keyboard.down('=');
  await expect(split.locator('body')).toHaveAttribute('data-zoom-key-default-prevented', 'true');
  await split.keyboard.up('='); await split.keyboard.up('Shift'); await split.keyboard.up('Meta');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await split.getByRole('button', { name: '設定', exact: true }).click();
  await split.keyboard.press('Meta+Shift+=');
  await expect(split.locator('body')).toHaveAttribute('data-zoom-key-default-prevented', 'true');
  expect(await split.evaluate(async () => chrome.tabs.getZoom((await chrome.tabs.getCurrent())!.id!))).toBe(1);
});

test('R-24 開いている枠メニューは対象が削除されると閉じる', async ({ split }) => {
  await pane(split, 2).getByRole('combobox', { name: 'アドレス' }).click();
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).toBeVisible();
  // R-69: ⌘⇧D now adds to the right; Ctrl⇧D deletes the selected pane.
  await split.keyboard.press('Control+Shift+d');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).toBeHidden();
});

test('R-24 枠番号をキーボードから操作して固定メニューを開ける', async ({ split }) => {
  const number = pane(split, 1).locator('.pane-number');
  await number.focus();
  await split.keyboard.press('Shift+F10');
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).toBeVisible();
  await split.keyboard.press('Enter');
  await expect(pane(split, 1)).toHaveClass(/fixed/);
});

test('R-20 R-26 倍率変更とそのUndo/Redoは選択中の複数境界を解除しない', async ({ split }) => {
  const lines = split.getByRole('button', { name: '左右の境界', exact: true });
  await lines.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await lines.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(2);
  await pane(split, 2).getByRole('combobox', { name: 'アドレス' }).click();
  await split.keyboard.press('Meta+Shift+=');
  await expect(pane(split, 2).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(2);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(2);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(2);
});

test('R-24 about:blankの子フレームをキーボードで操作した場合も親枠を選択する', async ({ split }) => {
  await openUrl(split, 1, site('b', '/frame?src=about%3Ablank'));
  const child = pane(split, 1).frameLocator('iframe').frameLocator('iframe[title="child"]');
  await child.locator('body').evaluate(element => { const button = document.createElement('button'); button.textContent = 'Editor'; element.append(button); });
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  const editor = child.getByRole('button', { name: 'Editor' });
  await editor.focus(); await split.keyboard.press('Space');
  await expect(pane(split, 1)).toHaveClass(/active/);
  await split.keyboard.press('Meta+Shift+=');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
});

test('R-24 srcdocの子フレームと通常タブを区別して対象枠のみ選択する', async ({ split, context }) => {
  const html = '<button>Embedded editor</button>';
  const fixture = site('b', `/frame?srcdoc=${encodeURIComponent(html)}`);
  await openUrl(split, 1, fixture);
  const editor = pane(split, 1).frameLocator('iframe').frameLocator('iframe[title="child"]').getByRole('button', { name: 'Embedded editor' });
  await expect(editor).toBeVisible();
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await editor.focus(); await split.keyboard.press('Space');
  await expect(pane(split, 1)).toHaveClass(/active/);
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  const normal = await context.newPage(); await normal.goto(fixture);
  const normalEditor = normal.frameLocator('iframe').getByRole('button', { name: 'Embedded editor' });
  await normalEditor.focus(); await normal.keyboard.press('Space');
  await split.bringToFront();
  await expect(pane(split, 0)).toHaveClass(/active/);
});

test('R-24 R-26 ページがwindowの入力伝播を止めても選択と倍率が追随する', async ({ split }) => {
  await openUrl(split, 1, site('b', '/stop-capture'));
  const marker = pane(split, 1).frameLocator('iframe').getByTestId('marker');
  await expect(marker).toBeVisible();
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await clickHovered(marker);
  await expect(pane(split, 1)).toHaveClass(/active/);
  await split.keyboard.press('Meta+Shift+=');
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
});
