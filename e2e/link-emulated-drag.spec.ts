import { test, expect, openUrl, pane, site, moveIntoFrame, enableDragDiagnostic } from './fixtures';
import type { Page } from '@playwright/test';

// R-80: a link dragged inside a pane is emulated with pointer events because Chrome blocks
// same-page, cross-site native drags (crbug.com/59081). These tests drive the real mouse.
const count = (split: Page) => split.getByRole('spinbutton', { name: '表示数', exact: true });
async function grabLink(split: Page, index: number, path = '/link'): Promise<{ x: number; y: number }> {
  await openUrl(split, index, site('a', path));
  const link = pane(split, index).frameLocator('iframe').getByTestId(path.includes('img=1') ? 'link-image' : 'link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, index);
  const source = (await link.boundingBox())!;
  const x = source.x + source.width / 2, y = source.y + source.height / 2;
  await split.mouse.move(x, y);
  await split.mouse.down();
  await split.mouse.move(x + 12, y + 12, { steps: 4 });
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await expect(split.locator('#app')).toHaveClass(/number-dragging/);
  return { x, y };
}

test('R-80 枠内のリンクを境界線へ運ぶと数字ドラッグと同じ表示で枠が増え、元のページは残る', async ({ split }) => {
  await enableDragDiagnostic(split);
  await grabLink(split, 0);
  const divider = split.locator('.split-divider.x').first();
  const box = (await divider.boundingBox())!;
  await split.mouse.move(box.x + box.width / 2, box.y + box.height * .2, { steps: 12 });
  await expect(divider).toHaveClass(/number-drop-target/);
  await expect(split.locator('.link-drop-preview')).toBeVisible();
  await expect(split.locator('.link-drop-zone')).toBeVisible();
  await split.mouse.up();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await expect(split.locator('.link-drag-ghost')).toBeHidden();
  await expect(split.locator('#app')).not.toHaveClass(/number-dragging/);
  await expect(split.locator('.drag-diagnostic')).toContainText('模擬ドラッグ');
  expect(await pane(split, 0).frameLocator('iframe').locator('body').evaluate(() => getSelection()?.toString() ?? '')).toBe('');
});

test('R-80 別の枠の中央と空の枠へ運んだときの追加先', async ({ split }) => {
  await openUrl(split, 1, site('b', '/plain'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await grabLink(split, 0);
  const loaded = (await pane(split, 1).locator('.pane-view').boundingBox())!;
  await split.mouse.move(loaded.x + loaded.width / 2, loaded.y + loaded.height / 2, { steps: 12 });
  await expect(split.locator('.link-drop-preview')).toBeVisible();
  await split.mouse.up();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const second = (await pane(split, 1).boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect(added.x).toBeGreaterThan(second.x + second.width - 2);
  await grabLink(split, 0);
  const empty = (await pane(split, 2).locator('.pane-view').boundingBox())!;
  await split.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 12 });
  await expect(pane(split, 2)).toHaveClass(/drop-target/);
  await split.mouse.up();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

test('R-80 Escape・元の枠の中央・ツールバーでは何も変えず、リンクのクリックにもならない', async ({ split }) => {
  await enableDragDiagnostic(split);
  const start = await grabLink(split, 0);
  const divider = (await split.locator('.split-divider').first().boundingBox())!;
  await split.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2, { steps: 8 });
  await split.keyboard.press('Escape');
  await expect(split.locator('.link-drag-ghost')).toBeHidden();
  await split.mouse.up();
  await split.waitForTimeout(500);
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await grabLink(split, 0);
  await split.mouse.move(start.x + 40, start.y + 60, { steps: 6 });
  await split.mouse.up();
  await split.waitForTimeout(500);
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await expect(split.locator('.drag-diagnostic')).toContainText('元の枠');
  await grabLink(split, 0);
  const input = (await count(split).boundingBox())!;
  await split.mouse.move(input.x + input.width / 2, input.y + input.height / 2, { steps: 10 });
  await split.mouse.up();
  await split.waitForTimeout(500);
  await expect(count(split)).toHaveValue('4');
  await expect(split.locator('.link-drag-ghost')).toBeHidden();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toBeEnabled();
});

test('R-80 画像つきリンクと伝播を止めるページでもリンク先で枠が増える', async ({ split }) => {
  for (const path of ['/link?img=1', '/link?stop=1']) {
    const before = Number(await count(split).inputValue());
    await grabLink(split, 0, path);
    const divider = split.locator('.split-divider.x').first();
    const box = (await divider.boundingBox())!;
    await split.mouse.move(box.x + box.width / 2, box.y + box.height * .2, { steps: 12 });
    await expect(divider).toHaveClass(/number-drop-target/);
    await split.mouse.up();
    await expect(count(split)).toHaveValue(String(before + 1));
    await expect(pane(split, before).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  }
});

test('R-80 Shift を押してつかむとネイティブのドラッグのまま模擬ドラッグにならない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = (await link.boundingBox())!;
  await split.keyboard.down('Shift');
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('#app')).toHaveClass(/dragging/);
  await expect(split.locator('.link-drag-ghost')).toBeHidden();
  await split.keyboard.press('Escape');
  await split.mouse.up();
  await split.keyboard.up('Shift');
  await expect(split.locator('#app')).not.toHaveClass(/dragging/, { timeout: 5000 });
  await expect(count(split)).toHaveValue('4');
});
