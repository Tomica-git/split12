import { test, expect, openSessions, openUrl, pane, site } from './fixtures';
import type { Page } from '@playwright/test';

const rowsOf = (split: Page) => split.getByRole('complementary', { name: 'セッション' }).locator('.view-choice');
async function threeViews(split: Page): Promise<void> {
  await openSessions(split);
  await openUrl(split, 0, site('a', '/plain?swap-1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  for (const number of [2, 3]) {
    await split.getByRole('complementary', { name: 'セッション' }).getByRole('button', { name: '新しいビュー', exact: true }).click();
    await expect(split).toHaveTitle(new RegExp(`ビュー ${number} - Split12`));
    await openUrl(split, 0, site('a', `/plain?swap-${number}`));
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 2/, /ビュー 3/]);
}
async function dragName(split: Page, from: number, to: number): Promise<void> {
  const a = (await rowsOf(split).nth(from).boundingBox())!, b = (await rowsOf(split).nth(to).boundingBox())!;
  await split.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await split.mouse.down();
  await split.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
}

test('R-97 編集中に名前をドラッグすると2つだけを入れ替え、間のビューは動かさず保存する', async ({ split }) => {
  await threeViews(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await expect(side.locator('.view-move')).toHaveCount(0);
  await expect(side.getByText('その2つだけを入れ替えます')).toBeVisible();
  await dragName(split, 0, 2);
  await expect(side.locator('.view-row.swap-target')).toContainText('ビュー 3');
  await split.mouse.up();
  await expect(rowsOf(split)).toHaveText([/ビュー 3/, /ビュー 2/, /ビュー 1/]);
  await expect.poll(async () => (await split.evaluate(async () => (await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ title: string }> })).views.map(view => view.title)).toEqual(['ビュー 3', 'ビュー 2', 'ビュー 1']);
  await split.reload();
  await expect(split.getByRole('complementary', { name: 'セッション' })).toBeVisible();
  await expect(rowsOf(split)).toHaveText([/ビュー 3/, /ビュー 2/, /ビュー 1/]);
});

test('R-97 名前のドラッグはEscや同じ行で離すと入れ替えず、クリックの選択と編集外のダブルクリックは従来どおり', async ({ split }) => {
  await threeViews(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await dragName(split, 0, 1);
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await expect(side.locator('.swap-source, .swap-target')).toHaveCount(0);
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 2/, /ビュー 3/]);
  const a = (await rowsOf(split).nth(1).boundingBox())!;
  await split.mouse.move(a.x + 20, a.y + a.height / 2); await split.mouse.down();
  await split.mouse.move(a.x + 60, a.y + a.height / 2, { steps: 4 }); await split.mouse.up();
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 2/, /ビュー 3/]);
  await rowsOf(split).nth(1).click();
  await expect(rowsOf(split).nth(1)).toHaveAttribute('data-selected', 'true');
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await expect(side.getByText('その2つだけを入れ替えます')).toBeHidden();
  await rowsOf(split).nth(0).dblclick();
  await expect(split).toHaveTitle(/ビュー 1 - Split12/);
});
