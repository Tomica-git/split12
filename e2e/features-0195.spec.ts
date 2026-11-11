import { test, expect, openUrl, pane, site } from './fixtures';

test('R-55 数字を枠の左辺へ移し、プレビュー・ページ保持・Undoと再読み込みを確認する', async ({ split }) => {
  for (let i = 0; i < 4; i++) {
    await openUrl(split, i, site(i % 2 ? 'b' : 'a', `/token?side=${i}`));
    await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toBeVisible();
  }
  await split.evaluate(async () => {
    const workspace = (await chrome.storage.local.get('workspace')).workspace as { layout: unknown };
    workspace.layout = { axis: 'x', ratio: .5, first: { axis: 'y', ratio: 1 / 3, first: { pane: 0 }, second: { axis: 'y', ratio: .5, first: { pane: 3 }, second: { pane: 1 } } }, second: { pane: 2 } };
    await chrome.storage.local.set({ workspace });
  });
  await split.reload();
  const tokens = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).frameLocator('iframe').getByTestId('token').textContent()));
  const before = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  const target = (await pane(split, 3).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(target.x + 16, target.y + target.height / 2, { steps: 12 });
  await expect(split.locator('.number-drop-preview')).toBeVisible();
  await split.mouse.up();
  const boxes = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  expect(boxes[2]).toEqual(before[2]);
  expect(boxes[1]!.x + boxes[1]!.width).toBeCloseTo(boxes[3]!.x, 0);
  expect(boxes[1]!.y).toBeCloseTo(boxes[0]!.y + boxes[0]!.height, 0);
  expect(boxes[1]!.width).toBeCloseTo(boxes[3]!.width, 0);
  for (let i = 0; i < 4; i++) await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(before);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  await split.reload();
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(boxes);
});

test('R-55 外周の左辺にドラッグして移動する', async ({ split }) => {
  const grid = (await split.getByRole('main', { name: '分割ビュー' }).boundingBox())!;
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(grid.x + 2, grid.y + grid.height * .3, { steps: 12 });
  await expect(split.locator('.number-drop-preview')).toBeVisible();
  await split.mouse.up();
  const moved = (await pane(split, 1).boundingBox())!;
  expect(moved.x).toBeCloseTo(grid.x, 0);
  expect(moved.width).toBeCloseTo(grid.width / 3, 0);
  expect(moved.height).toBeCloseTo(grid.height, 0);
});

for (const side of ['top', 'right', 'bottom'] as const) {
  test(`R-55 外周の${side}へ移動する`, async ({ split }) => {
    const grid = (await split.getByRole('main', { name: '分割ビュー' }).boundingBox())!;
    const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
    const x = side === 'right' ? grid.x + grid.width - 2 : grid.x + grid.width * .3;
    const y = side === 'top' ? grid.y + 2 : side === 'bottom' ? grid.y + grid.height - 2 : grid.y + grid.height * .3;
    await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await split.mouse.down(); await split.mouse.move(x, y, { steps: 12 }); await split.mouse.up();
    const moved = (await pane(split, 1).boundingBox())!;
    if (side === 'right') { expect(moved.x + moved.width).toBeCloseTo(grid.x + grid.width, 0); expect(moved.width).toBeCloseTo(grid.width / 3, 0); }
    if (side === 'top') { expect(moved.y).toBeCloseTo(grid.y, 0); expect(moved.height).toBeCloseTo(grid.height / 3, 0); }
    if (side === 'bottom') { expect(moved.y + moved.height).toBeCloseTo(grid.y + grid.height, 0); expect(moved.height).toBeCloseTo(grid.height / 3, 0); }
  });
}

test('R-55 ドラッグ途中のEscでプレビューを閉じ、配置を変えない', async ({ split }) => {
  const before = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  const grid = (await split.getByRole('main', { name: '分割ビュー' }).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(grid.x + 2, grid.y + grid.height * .3, { steps: 12 });
  await expect(split.locator('.number-drop-preview')).toBeVisible();
  await split.keyboard.press('Escape'); await split.mouse.up();
  await expect(split.locator('.number-drop-preview')).toHaveCount(0);
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(before);
});
