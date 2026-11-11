import { test, expect, openUrl, pane, site, moveIntoFrame, enableDragDiagnostic } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

const data = (url = site('b', '/page2'), html?: string) => ({ items: [{ mimeType: 'text/uri-list', data: url }, ...(html ? [{ mimeType: 'text/html', data: html }] : [])], dragOperationsMask: 1 });
async function dropAt(split: Page, context: BrowserContext, x: number, y: number, options: { modifiers?: number; payload?: ReturnType<typeof data> } = {}): Promise<void> {
  const cdp = await context.newCDPSession(split);
  const payload = options.payload ?? data();
  // The harness re-targets only on a further enter once the shield has appeared over a frame.
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data: payload, modifiers: options.modifiers });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: x + 1, y: y + 1, data: payload, modifiers: options.modifiers });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: payload, modifiers: options.modifiers });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data: payload, modifiers: options.modifiers });
  await cdp.detach();
}
const count = (split: Page) => split.getByRole('spinbutton', { name: '表示数', exact: true });

test('R-79 固定タブの専用ゾーンへ落とすと右に追加され、Undo/Redoと再読み込みで保持する', async ({ split, context }) => {
  await enableDragDiagnostic(split);
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const divider = (await split.locator('.split-divider').first().boundingBox())!;
  const cdp = await context.newCDPSession(split);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: divider.x + divider.width / 2, y: divider.y + divider.height / 2, data: data() });
  const zone = split.locator('.link-drop-zone');
  await expect(zone).toBeVisible();
  await expect(zone).toHaveText('固定タブの右に追加');
  const before = (await pane(split, 0).boundingBox())!, zoneBox = (await zone.boundingBox())!;
  expect(zoneBox.x).toBeGreaterThan(before.x + before.width / 2);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: zoneBox.x + zoneBox.width / 2, y: zoneBox.y + zoneBox.height / 2, data: data() });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: zoneBox.x + zoneBox.width / 2 + 1, y: zoneBox.y + zoneBox.height / 2 + 1, data: data() });
  await expect(split.locator('.link-drop-preview')).toBeVisible();
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: zoneBox.x + zoneBox.width / 2, y: zoneBox.y + zoneBox.height / 2, data: data() });
  await cdp.detach();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const first = (await pane(split, 0).boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect(added.x).toBeGreaterThan(first.x + first.width - 2);
  expect(Math.abs(added.y - first.y)).toBeLessThan(2);
  await expect(zone).toBeHidden();
  await expect(split.locator('.drag-diagnostic')).toContainText('追加');
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('button', { name: '変更をやり直す' }).click();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await split.reload();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-79 ツールバーと交点へのURLドロップではタブも枠も変わらない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const input = (await count(split).boundingBox())!;
  await dropAt(split, context, input.x + input.width / 2, input.y + input.height / 2);
  const junction = (await split.locator('.split-junction').first().boundingBox())!;
  await dropAt(split, context, junction.x + junction.width / 2, junction.y + junction.height / 2);
  await expect(split.getByRole('status').filter({ hasText: '交点には追加できません' })).toBeVisible();
  await split.waitForTimeout(500);
  await expect(split).toHaveURL(/chrome-extension:\/\/.*\/split\.html/);
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-79 読み込み済みの枠の中央はShiftでも追加し、空の枠はその枠で開く', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const empty = (await pane(split, 1).locator('.pane-view').boundingBox())!;
  await dropAt(split, context, empty.x + empty.width / 2, empty.y + empty.height / 2);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(count(split)).toHaveValue('4');
  const loaded = (await pane(split, 0).locator('.pane-view').boundingBox())!;
  await dropAt(split, context, loaded.x + loaded.width / 2, loaded.y + loaded.height / 2, { payload: data(site('b', '/token')) });
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('token')).toBeVisible();
  const first = (await pane(split, 0).boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect(added.x).toBeGreaterThan(first.x + first.width - 2);
  // A loaded page is never replaced, even with Shift held: the drop adds another pane.
  const again = (await pane(split, 0).locator('.pane-view').boundingBox())!;
  await dropAt(split, context, again.x + again.width / 2, again.y + again.height / 2, { modifiers: 8 });
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(count(split)).toHaveValue('6');
  await expect(pane(split, 5).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

test('R-79 R-80 伝播を止めるページのリンクを別枠へ素早くドラッグしても模擬ドラッグで追加する', async ({ split }) => {
  await enableDragDiagnostic(split);
  await openUrl(split, 1, site('b', '/plain'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await openUrl(split, 0, site('a', '/link?stop=1'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = (await link.boundingBox())!, target = (await pane(split, 1).locator('.pane-view').boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await split.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 2 });
  await split.mouse.up();
  await expect(count(split)).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(split.locator('.drag-diagnostic')).toContainText('模擬ドラッグ');
});

test('R-79 枠内のページに落ちたURLはページ側から中継され、落とした位置の辺で追加する', async ({ split, context }) => {
  await enableDragDiagnostic(split);
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const frame = split.frames().find(item => item.url() === site('a', '/plain'))!;
  // A frame session takes coordinates inside that frame, so the drop lands in the page itself.
  const cdp = await context.newCDPSession(frame);
  for (const expectBelow of [false, true]) {
    const view = (await pane(split, 0).locator('.pane-view').boundingBox())!;
    const x = view.width / 2, y = expectBelow ? view.height - 10 : view.height / 2;
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data: data() });
    await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: data() });
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data: data() });
    await expect(split.locator('.drag-diagnostic')).toContainText('中継');
    const first = (await pane(split, 0).boundingBox())!;
    const added = (await pane(split, expectBelow ? 5 : 4).boundingBox())!;
    if (expectBelow) expect(added.y).toBeGreaterThan(first.y + first.height - 2); else expect(added.x).toBeGreaterThan(first.x + first.width - 2);
  }
  await cdp.detach();
  await expect(count(split)).toHaveValue('6');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 5).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

test('R-79 固定した追加方向に従い、専用ゾーンと中央の追加先が下になる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('button', { name: '下に追加（上下に追加）' }).click({ button: 'right' });
  const divider = (await split.locator('.split-divider').first().boundingBox())!;
  const cdp = await context.newCDPSession(split);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: divider.x + divider.width / 2, y: divider.y + divider.height / 2, data: data() });
  await expect(split.locator('.link-drop-zone')).toHaveText('固定タブの下に追加');
  await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: divider.x, y: divider.y, data: data() });
  await cdp.detach();
  const loaded = (await pane(split, 0).locator('.pane-view').boundingBox())!;
  await dropAt(split, context, loaded.x + loaded.width / 2, loaded.y + loaded.height / 2);
  await expect(count(split)).toHaveValue('5');
  const first = (await pane(split, 0).boundingBox())!, added = (await pane(split, 4).boundingBox())!;
  expect(added.y).toBeGreaterThan(first.y + first.height - 2);
  expect(Math.abs(added.x - first.x)).toBeLessThan(2);
});

test('R-79 リンクのない画像のドロップは追加せず理由を表示する', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const divider = (await split.locator('.split-divider').first().boundingBox())!;
  const image = site('b', '/p.jpg');
  await dropAt(split, context, divider.x + divider.width / 2, divider.y + divider.height / 2, { payload: data(image, `<img src="${image}">`) });
  await expect(split.getByRole('status').filter({ hasText: '画像ではなくリンクをドラッグしてください' })).toBeVisible();
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-79 リンクのドラッグ中も数字のドラッグと同じく境界線が光り交点は赤くなる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const divider = split.locator('.split-divider.x').first();
  const box = (await divider.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height * .2;
  const cdp = await context.newCDPSession(split);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data: data() });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: data() });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: x + 1, y: y + 1, data: data() });
  await expect(divider).toHaveClass(/number-drop-target/);
  await expect(split.locator('.link-drop-preview')).toBeVisible();
  const junction = (await split.locator('.split-junction').first().boundingBox())!;
  const jx = junction.x + junction.width / 2, jy = junction.y + junction.height / 2;
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: jx, y: jy, data: data() });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: jx + 1, y: jy + 1, data: data() });
  await expect(split.locator('.split-junction').first()).toHaveClass(/number-drop-invalid/);
  await expect(divider).not.toHaveClass(/number-drop-target/);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: jx, y: jy, data: data() });
  await cdp.detach();
  await split.mouse.move(jx + 40, jy + 40, { steps: 3 });
  await expect(split.locator('.split-junction').first()).not.toHaveClass(/number-drop-invalid/);
  await expect(count(split)).toHaveValue('4');
});
