import { test, expect, openUrl, pane, site, createNewView, openSessions } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function dragLine(page: Page, handle: Locator, dx: number, dy = 0): Promise<void> {
  const rect = (await handle.boundingBox())!;
  const x = rect.x + rect.width / 2, y = rect.y + 20;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}

test('R-27 レイアウトテンプレートの保存・新規作成・候補作成を開ける', async ({ split }) => {
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await expect(dialog.getByRole('button', { name: 'テンプレート保存', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '新規テンプレート作成', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'テンプレート候補作成', exact: true })).toBeVisible();
});

test('R-28 セッション一覧に名前変更と削除の操作がある', async ({ split }) => {
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const sidebar = split.getByRole('complementary', { name: 'セッション' });
  await expect(sidebar.locator('.view-open')).toBeVisible();
  // R-81: double-click opens a view; renaming is on F2 and the context menu.
  await sidebar.locator('.view-choice').first().focus();
  await sidebar.locator('.view-choice').first().press('F2');
  await expect(split.getByRole('dialog', { name: 'ビューの名前を変更' })).toBeVisible();
  await split.getByRole('dialog', { name: 'ビューの名前を変更' }).getByRole('button', { name: 'キャンセル' }).click();
  await expect(sidebar.getByRole('button', { name: /削除/ }).first()).toBeVisible();
});

test('R-29 表示名とmanifestがSplit12になる', async ({ split }) => {
  await expect(split.locator('.brand strong')).toHaveText('Split12');
  await expect(split).toHaveTitle(/Split12/);
  expect(await split.evaluate(() => chrome.runtime.getManifest().name)).toContain('Split12');
});

test('R-30 URL欄右に通常タブを開くアイコンを出さない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/token?no-external'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toBeVisible();
  const tabs = context.pages().length, url = split.url();
  await expect(pane(split, 0).locator('.pane-bar').getByRole('button', { name: '新しいタブで開く', exact: true })).toHaveCount(0);
  expect(context.pages()).toHaveLength(tabs); expect(split.url()).toBe(url);
});

test('R-32 近くの隣接境界へ1軸ドラッグを吸着させる', async ({ split }) => {
  const vertical = split.getByRole('button', { name: '左右の境界', exact: true });
  await dragLine(split, vertical.nth(0), 60);
  const target = (await vertical.nth(0).boundingBox())!, bottom = (await vertical.nth(1).boundingBox())!;
  expect(Math.abs(target.x - bottom.x)).toBeGreaterThan(40);
  await dragLine(split, vertical.nth(1), target.x - bottom.x - 5);
  const snapped = (await vertical.nth(1).boundingBox())!;
  expect(Math.abs(snapped.x - target.x)).toBeLessThan(1);
});

test('R-32 交点を2軸で動かしながら近い縦境界へ吸着できる', async ({ split }) => {
  const vertical = split.getByRole('button', { name: '左右の境界', exact: true });
  await dragLine(split, vertical.nth(0), 60);
  const source = (await vertical.nth(0).boundingBox())!, target = (await vertical.nth(1).boundingBox())!;
  const junctions = await split.getByRole('button', { name: '境界の交点', exact: true }).all();
  expect(junctions).toHaveLength(2);
  const boxes = await Promise.all(junctions.map(junction => junction.boundingBox()));
  const selected = boxes.find(box => box && Math.abs((box.x + box.width / 2) - (source.x + source.width / 2)) < 2)!;
  const start = (await pane(split, 0).boundingBox())!;
  const x = selected.x + selected.width / 2, y = selected.y + selected.height / 2;
  await split.mouse.move(x, y); await split.mouse.down();
  await split.mouse.move(x + target.x - source.x + 5, y + 32, { steps: 8 }); await split.mouse.up();
  const top = (await vertical.nth(0).boundingBox())!, bottom = (await vertical.nth(1).boundingBox())!;
  expect(Math.abs(top.x - bottom.x)).toBeLessThan(1);
  expect((await pane(split, 0).boundingBox())!.height).toBeGreaterThan(start.height + 20);
});

test('R-31 枠番号のドラッグは外部へURLやテキストを渡さず枠交換を維持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?drag-source'));
  await openUrl(split, 1, site('b', '/token?drag-target'));
  const first = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const second = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  const firstBox = (await pane(split, 0).boundingBox())!, secondBox = (await pane(split, 1).boundingBox())!;
  await split.evaluate(() => {
    document.addEventListener('dragstart', event => {
      if (!event.isTrusted || !event.dataTransfer || !(event.target instanceof Element) || !event.target.closest('.pane-number')) return;
      document.body.dataset.dragTypes = JSON.stringify([...event.dataTransfer.types]);
      document.body.dataset.dragUri = event.dataTransfer.getData('text/uri-list');
      document.body.dataset.dragText = event.dataTransfer.getData('text/plain');
    });
  });
  await pane(split, 0).locator('.pane-number').dragTo(pane(split, 1).locator('.pane-number'));
  expect(await split.locator('body').getAttribute('data-drag-types')).toBeNull();
  await expect.poll(async () => (await pane(split, 0).boundingBox())?.x).toBeCloseTo(secondBox.x, 0);
  await expect.poll(async () => (await pane(split, 1).boundingBox())?.x).toBeCloseTo(firstBox.x, 0);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(first!);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(second!);
});

test('R-27 配置だけを保存し候補は適用まで変更せず、適用とUndoはページを保つ', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?template'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await pane(split, 0).getByRole('button', { name: '表示倍率' }).click();
  await pane(split, 0).getByRole('button', { name: '120%', exact: true }).click();
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('textbox', { name: 'テンプレート名' }).fill('作業配置');
  await dialog.getByRole('button', { name: '新規テンプレート作成', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '作業配置を適用' })).toBeVisible();
  const stored = await split.evaluate(async () => (await chrome.storage.local.get('layoutTemplates')).layoutTemplates as { templates: Array<{ count: number }> });
  expect(stored.templates).toHaveLength(1);
  expect(stored.templates[0]!.count).toBe(2);
  expect(JSON.stringify(stored)).not.toContain(site('a', '/token?template'));
  expect(JSON.stringify(stored)).not.toContain('zoom');
  expect(JSON.stringify(stored)).not.toContain('fixedSlot');
  await dialog.getByRole('spinbutton', { name: '候補の枚数' }).fill('3');
  await dialog.getByRole('button', { name: 'テンプレート候補作成', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  await dialog.getByRole('button', { name: '均等・横並びの候補を適用' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  await dialog.getByRole('button', { name: '作業配置を適用' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('120%');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await split.reload();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('3');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('120%');
});

test('R-27 保存済みテンプレートは別のビューで共有し選択・上書き・削除できる', async ({ split, context }) => {
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('textbox', { name: 'テンプレート名' }).fill('共有');
  await dialog.getByRole('button', { name: '新規テンプレート作成' }).click();
  await expect(dialog.getByRole('button', { name: '共有を選択' })).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる' }).click();
  const opening = context.waitForEvent('page'); await createNewView(split);
  const second = await opening;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await second.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await second.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await second.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const secondDialog = second.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await secondDialog.getByRole('button', { name: '共有を選択' }).click();
  await secondDialog.getByRole('button', { name: 'テンプレート保存', exact: true }).click();
  await secondDialog.getByRole('button', { name: '実行する' }).click();
  await expect.poll(async () => (await second.evaluate(async () => (await chrome.storage.local.get('layoutTemplates')).layoutTemplates as { templates: Array<{ count: number }> })).templates[0]!.count).toBe(2);
  await secondDialog.getByRole('button', { name: '共有を削除' }).click();
  await secondDialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(secondDialog.getByRole('button', { name: '共有を適用' })).toBeVisible();
  await secondDialog.getByRole('button', { name: '共有を削除' }).click();
  await secondDialog.getByRole('button', { name: '実行する' }).click();
  await expect(secondDialog.getByRole('button', { name: '共有を適用' })).toHaveCount(0);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-28 ビュー名は一覧・タブ・保存へ同期し削除取消後に現在ビューを削除できる', async ({ split, context }) => {
  const deletedUrl = split.url();
  await openUrl(split, 0, site('a', '/token?delete-main'));
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const sidebar = split.getByRole('complementary', { name: 'セッション' });
  await sidebar.locator('.view-choice').first().focus();
  await sidebar.locator('.view-choice').first().press('F2');
  const rename = split.getByRole('dialog', { name: 'ビューの名前を変更' });
  await rename.getByRole('textbox', { name: 'ビュー名' }).fill('作業ビュー');
  await rename.getByRole('button', { name: '変更する' }).click();
  await expect(split).toHaveTitle('作業ビュー - Split12');
  await expect(sidebar.getByRole('navigation')).toContainText('作業ビュー');
  await expect.poll(async () => (await split.evaluate(async () => (await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ title: string }> })).views[0]!.title).toBe('作業ビュー');
  await sidebar.getByRole('button', { name: /削除/ }).click();
  await split.getByRole('dialog', { name: 'ビューを削除' }).getByRole('button', { name: 'キャンセル' }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toBeVisible();
  const normal = await context.newPage(); await normal.goto(site('b', '/plain?normal'));
  const opening = context.waitForEvent('page'); const closed = split.waitForEvent('close');
  await sidebar.getByRole('button', { name: /削除/ }).click();
  await split.getByRole('dialog', { name: 'ビューを削除' }).getByRole('button', { name: '削除する' }).click();
  const replacement = await opening; await closed;
  await expect(replacement).toHaveURL(/view=[a-f\d-]{36}/);
  await expect(replacement.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(replacement, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('');
  await expect(normal).toHaveURL(site('b', '/plain?normal'));
  const storage = await replacement.evaluate(async () => chrome.storage.local.get(['workspace', 'viewRegistry', 'viewTombstones']) as Promise<{ workspace?: unknown; viewRegistry: { views: Array<{ id: string }> }; viewTombstones: { ids: string[] } }>);
  expect(storage.workspace).toBeUndefined(); expect(storage.viewTombstones.ids).toContain('main');
  expect(storage.viewRegistry.views.some((view: { id: string }) => view.id === 'main')).toBe(false);
  await replacement.evaluate(() => chrome.storage.local.set({ workspace: { late: true } }));
  await expect.poll(async () => (await replacement.evaluate(async () => chrome.storage.local.get('workspace'))).workspace).toBeUndefined();
  const stale = await context.newPage(); await stale.goto(deletedUrl);
  await expect(stale).toHaveURL(/view=[a-f\d-]{36}/);
  await expect(pane(stale, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('');
  expect(stale.url()).not.toBe(replacement.url());
});

test('R-24 R-25 R-26 R-27 R-32 固定・選択と倍率を保ったまま2軸配置を保存して適用する', async ({ split }) => {
  await openUrl(split, 1, site('b', '/token?combined-018'));
  const token = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  await pane(split, 1).getByRole('combobox', { name: 'アドレス' }).click();
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await split.keyboard.press('Meta+Shift+=');
  const point = (await split.getByRole('button', { name: '境界の交点', exact: true }).first().boundingBox())!;
  const first = (await pane(split, 0).boundingBox())!;
  await split.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await split.mouse.down();
  await split.mouse.move(point.x + point.width / 2 + 35, point.y + point.height / 2 + 25, { steps: 4 }); await split.mouse.up();
  const adjusted = (await pane(split, 0).boundingBox())!;
  expect(adjusted.width).toBeGreaterThan(first.width + 20); expect(adjusted.height).toBeGreaterThan(first.height + 15);
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('textbox', { name: 'テンプレート名' }).fill('組合せ');
  await dialog.getByRole('button', { name: '新規テンプレート作成' }).click();
  await expect(dialog.getByRole('button', { name: '組合せを適用' })).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await split.getByRole('button', { name: '縦並び' }).click();
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  await dialog.getByRole('button', { name: '組合せを適用' }).click();
  expect(await pane(split, 0).boundingBox()).toEqual(adjusted);
  await expect(pane(split, 1)).toHaveClass(/active/); await expect(pane(split, 2)).toHaveClass(/fixed/);
  await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  await split.reload();
  await expect(pane(split, 2)).toHaveClass(/fixed/); await expect(pane(split, 1).getByRole('button', { name: '表示倍率' })).toHaveText('110%');
});

test('R-32 画面変更後もガイドを表示しAltで吸着を一時解除できる', async ({ split }) => {
  const vertical = split.getByRole('button', { name: '左右の境界', exact: true });
  await dragLine(split, vertical.nth(0), 60);
  await split.setViewportSize({ width: 1100, height: 800 });
  const first = (await vertical.nth(0).boundingBox())!, second = (await vertical.nth(1).boundingBox())!;
  const x = second.x + second.width / 2, y = second.y + 20, distance = first.x - second.x - 5;
  await split.keyboard.down('Alt'); await split.mouse.move(x, y); await split.mouse.down();
  await split.mouse.move(x + distance, y, { steps: 6 }); await split.mouse.up(); await split.keyboard.up('Alt');
  expect(Math.abs((await vertical.nth(0).boundingBox())!.x - (await vertical.nth(1).boundingBox())!.x)).toBeGreaterThan(3);
  const near = (await vertical.nth(1).boundingBox())!;
  await split.mouse.move(near.x + near.width / 2, near.y + 20); await split.mouse.down();
  await split.mouse.move(near.x + near.width / 2 + 3, near.y + 20, { steps: 3 });
  await expect(split.locator('.snap-guide.x')).toBeVisible();
  await split.mouse.up();
  expect(Math.abs((await vertical.nth(0).boundingBox())!.x - (await vertical.nth(1).boundingBox())!.x)).toBeLessThan(1);
  await expect(split.locator('.snap-guide.x')).toBeHidden();
});

test('R-28 別ビューの名前変更と削除は開いているタブに同期し通常タブを閉じない', async ({ split, context }) => {
  const opening = context.waitForEvent('page'); await createNewView(split);
  const second = await opening;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await openSessions(second);
  const sidebar = second.getByRole('complementary', { name: 'セッション' });
  const list = sidebar.getByRole('navigation', { name: 'ビュー一覧' });
  await expect(list.getByRole('button')).toHaveCount(2);
  await list.getByRole('button').first().focus();
  await list.getByRole('button').first().press('F2');
  const rename = second.getByRole('dialog', { name: 'ビューの名前を変更' });
  await rename.getByRole('textbox', { name: 'ビュー名' }).fill('共有された名前');
  await rename.getByRole('button', { name: '変更する' }).click();
  await expect(split).toHaveTitle('共有された名前 - Split12');
  await expect(list.getByRole('button').first()).toContainText('共有された名前');
  const closed = split.waitForEvent('close');
  await sidebar.getByRole('button', { name: /削除/ }).click();
  await second.getByRole('dialog', { name: 'ビューを削除' }).getByRole('button', { name: '削除する' }).click();
  await closed;
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-28 削除処理中に対象が通常ページへ遷移したらタブを閉じない', async ({ split, context, sw }) => {
  const opening = context.waitForEvent('page'); await createNewView(split);
  const second = await opening;
  await expect(second.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await openSessions(second);
  const sidebar = second.getByRole('complementary', { name: 'セッション' });
  const list = sidebar.getByRole('navigation', { name: 'ビュー一覧' });
  await expect(list.getByRole('button')).toHaveCount(2);
  await list.getByRole('button').first().focus();
  await sw.evaluate(url => {
    const api = chrome.tabs as unknown as { sendMessage(id: number, message: { type?: string }, options?: { frameId?: number }): Promise<unknown> };
    const original = api.sendMessage.bind(chrome.tabs);
    api.sendMessage = async (id, message, options) => {
      if (message.type === 'view/deleted') { await chrome.tabs.update(id, { url }); return undefined; }
      return original(id, message, options);
    };
  }, site('a', '/plain?moved-during-delete'));
  await sidebar.getByRole('button', { name: /削除/ }).click();
  await second.getByRole('dialog', { name: 'ビューを削除' }).getByRole('button', { name: '削除する' }).click();
  await expect(split).toHaveURL(site('a', '/plain?moved-during-delete'));
  await expect(split.getByTestId('marker')).toHaveText('plain');
  await expect(list.getByRole('button')).toHaveCount(1);
});

test('R-31 番号を枠の外で離しても元ビュー・URL・タブ数は変わらない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/token?outside'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const before = (await pane(split, 0).boundingBox())!, count = context.pages().length;
  const number = (await pane(split, 0).locator('.pane-number').boundingBox())!;
  await split.mouse.move(number.x + number.width / 2, number.y + number.height / 2);
  await split.mouse.down(); await split.mouse.move(5, 2, { steps: 8 }); await split.mouse.up();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
  expect((await pane(split, 0).boundingBox())!.x).toBe(before.x);
  expect(context.pages()).toHaveLength(count);
});
