import { test, expect, openUrl, pane, site } from './fixtures';
import type { Page } from '@playwright/test';

async function dragToBoundary(page: Page, slot: number, divider: number): Promise<void> {
  const source = (await pane(page, slot).locator('.pane-number').boundingBox())!;
  const target = (await page.getByRole('button', { name: '左右の境界', exact: true }).nth(divider).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down(); await page.mouse.move(target.x + target.width / 2, target.y + target.height * .6, { steps: 15 }); await page.mouse.up();
}
async function boxes(page: Page) { return Promise.all([0, 1, 2, 3].map(i => pane(page, i).boundingBox())); }

test('R-46 消える境界へのドラッグはページと配置を保持し、直前の交換をUndo・Redoできる', async ({ split, context }) => {
  const pages = context.pages().length;
  for (let i = 0; i < 4; i++) {
    await openUrl(split, i, site(i % 2 ? 'b' : 'a', `/token?move=${i}`));
    await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toBeVisible();
  }
  const tokens = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).frameLocator('iframe').getByTestId('token').textContent()));
  await pane(split, 2).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  const original = await boxes(split);
  await pane(split, 0).locator('.pane-number').dragTo(pane(split, 1).locator('.pane-bar'));
  const swapped = await boxes(split);
  expect(swapped[0]!.x).not.toBe(original[0]!.x);
  await dragToBoundary(split, 1, 0);
  expect(await boxes(split)).toEqual(swapped);
  await expect(pane(split, 2)).toHaveClass(/fixed/);
  expect(context.pages()).toHaveLength(pages);
  for (let i = 0; i < 4; i++) await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await boxes(split)).toEqual(original);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  expect(await boxes(split)).toEqual(swapped);
  await split.reload();
  expect(await boxes(split)).toEqual(swapped);
  for (let i = 0; i < 4; i++) await expect(pane(split, i).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site(i % 2 ? 'b' : 'a', `/token?move=${i}`));
});

test('R-43 番号メニューに境界移動がなくEscでメニューを閉じられる', async ({ split }) => {
  await pane(split, 1).locator('.pane-number').click({ button: 'right' });
  await expect(split.getByRole('menuitem', { name: '境界線へ移動' })).toHaveCount(0);
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).toBeVisible();
  await split.keyboard.press('Escape');
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).not.toBeVisible();
});

test('R-43 キーボードで番号のメニューと境界を操作しても境界移動が起きない', async ({ split }) => {
  const before = await boxes(split);
  await pane(split, 1).locator('.pane-number').focus(); await split.keyboard.press('Shift+F10');
  await expect(split.getByRole('menuitem', { name: '境界線へ移動' })).toHaveCount(0);
  await split.keyboard.press('Escape');
  await split.getByRole('button', { name: '左右の境界', exact: true }).nth(1).focus();
  await split.keyboard.press('Enter');
  expect(await boxes(split)).toEqual(before);
});

test('R-43 番号を通常クリックした後の境界ドラッグはサイズ変更として動く', async ({ split }) => {
  await pane(split, 1).locator('.pane-number').click();
  const line = split.getByRole('button', { name: '左右の境界', exact: true }).nth(1);
  const before = (await line.boundingBox())!, x = before.x + before.width / 2, y = before.y + before.height * .6;
  await split.mouse.move(x, y); await split.mouse.down();
  await split.mouse.move(x + 70, y, { steps: 10 }); await split.mouse.up();
  expect((await line.boundingBox())!.x).toBeGreaterThan(before.x + 50);
  await expect(split.locator('.number-moving')).toHaveCount(0);
});

test('R-43 R-44 番号の最大化・設定・使い方の後も境界移動モードは発生しない', async ({ split }) => {
  await pane(split, 0).locator('.pane-number').dblclick();
  await expect(split.locator('.number-moving')).toHaveCount(0);
  await pane(split, 0).locator('.pane-number').dblclick();
  await split.getByRole('button', { name: '設定', exact: true }).click();
  await expect(split.locator('.number-moving')).toHaveCount(0);
  await split.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await split.getByRole('button', { name: '使い方', exact: true }).click();
  await expect(split.locator('.number-moving')).toHaveCount(0);
  await expect(split.getByRole('dialog', { name: 'Split12 の使い方' })).toBeVisible();
});

test('R-43 拡張コマンド経由の操作でも境界移動モードは発生しない', async ({ split, sw }) => {
  await pane(split, 1).locator('.pane-number').click({ button: 'right' });
  await expect(split.getByRole('menuitem', { name: '境界線へ移動' })).toHaveCount(0);
  const tabId = await split.evaluate(async () => (await chrome.tabs.getCurrent())!.id!);
  await sw.evaluate(async id => { await chrome.runtime.sendMessage({ type: 'app/action', tabId: id, action: 'toggle-sidebar' }); }, tabId);
  await expect(split.locator('.number-moving')).toHaveCount(0);
  await expect(split.getByRole('complementary', { name: 'セッション' })).toBeVisible();
});

test('R-43 境界・交点へのドロップとドラッグ取消は配置を変えない', async ({ split }) => {
  const before = await boxes(split);
  await dragToBoundary(split, 1, 0);
  expect(await boxes(split)).toEqual(before);
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  const target = (await split.getByRole('button', { name: '左右の境界', exact: true }).nth(1).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(target.x + target.width / 2, target.y + target.height * .6, { steps: 10 });
  await split.keyboard.press('Escape'); await split.mouse.up();
  expect(await boxes(split)).toEqual(before);
  const intersection = (await split.getByRole('button', { name: '境界の交点', exact: true }).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(intersection.x + intersection.width / 2, intersection.y + intersection.height / 2, { steps: 10 }); await split.mouse.up();
  expect(await boxes(split)).toEqual(before);
});
