import { test, expect, createNewView, openSessions, openUrl, pane, site } from './fixtures';
import type { Page } from '@playwright/test';

const rowsOf = (split: Page) => split.getByRole('complementary', { name: 'セッション' }).locator('.view-choice');
async function pageIn(split: Page, index: number, path: string): Promise<void> {
  await openUrl(split, index, site('a', path));
  await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toBeVisible();
}
async function addView(split: Page, number: number, path: string): Promise<void> {
  await split.getByRole('complementary', { name: 'セッション' }).getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(split).toHaveTitle(new RegExp(`ビュー ${number} - Split12`));
  await pageIn(split, 0, path);
}

test('R-95 拡張機能ボタンなどで増えたビューも一覧にない番号の名前にする', async ({ split }) => {
  await openSessions(split);
  await pageIn(split, 0, '/plain?v1');
  await addView(split, 2, '/plain?v2');
  await addView(split, 3, '/plain?v3');
  await rowsOf(split).first().dblclick();
  await expect(split).toHaveTitle(/ビュー 1 - Split12/);
  await rowsOf(split).filter({ hasText: 'ビュー 2' }).click();
  await split.getByRole('complementary', { name: 'セッション' }).getByRole('button', { name: 'ビュー 2 を削除' }).click();
  await split.getByRole('dialog', { name: 'ビューを削除' }).getByRole('button', { name: '削除する' }).click();
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 3/]);
  // Before 0.2.1 a view found in another tab was named 「ビュー (count + 1)」, here a second 「ビュー 3」.
  await createNewView(split);
  await expect(rowsOf(split)).toHaveCount(3);
  const titles = (await rowsOf(split).allTextContents()).map(text => text.replace(/ · 保存済み$/, ''));
  expect(new Set(titles).size).toBe(3);
  expect(titles).toContain('ビュー 2');
});

test('R-96 開いていないビューの一覧で行をダブルクリックすると、そのビューに切り替えてその枠を最大化する', async ({ split, context }) => {
  await openSessions(split);
  await pageIn(split, 0, '/plain?home');
  await addView(split, 2, '/plain?other-0');
  await openUrl(split, 1, site('b', '/page2?other-1'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const other = split.url();
  await rowsOf(split).first().dblclick();
  await expect(split).toHaveTitle(/ビュー 1 - Split12/);
  const pages = context.pages().length;
  await rowsOf(split).filter({ hasText: 'ビュー 2' }).click({ button: 'right' });
  await split.getByRole('menu', { name: 'ビューの操作' }).getByRole('menuitem', { name: '一覧' }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  await expect(dialog).toContainText('ダブルクリック');
  await dialog.getByRole('listitem').nth(1).locator('.pane-list-info').dblclick();
  await expect(split).toHaveURL(other);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0)).toBeHidden();
  await expect(pane(split, 1)).toHaveClass(/active/);
  expect(context.pages()).toHaveLength(pages);
  expect(new URL(split.url()).searchParams.has('focus')).toBe(false);
  await split.keyboard.press('Escape');
  await expect(pane(split, 0)).toBeVisible();
});

test('R-96 別のウィンドウで開いているビューの枠を選ぶと、そのタブを前に出してその枠を最大化する', async ({ split, context }) => {
  await openSessions(split);
  const opened = context.waitForEvent('page');
  await createNewView(split);
  const second = await opened;
  await openUrl(second, 2, site('b', '/page2?second-window'));
  await expect(pane(second, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const here = split.url();
  await rowsOf(split).nth(1).click({ button: 'right' });
  await split.getByRole('menu', { name: 'ビューの操作' }).getByRole('menuitem', { name: '一覧' }).click();
  await split.getByRole('dialog', { name: 'タブ一覧' }).getByRole('listitem').nth(2).locator('.pane-list-info').dblclick();
  await expect(pane(second, 0)).toBeHidden();
  await expect(pane(second, 2)).toBeVisible();
  await expect.poll(() => second.evaluate(async () => (await chrome.tabs.getCurrent())!.active)).toBe(true);
  expect(split.url()).toBe(here);
});
