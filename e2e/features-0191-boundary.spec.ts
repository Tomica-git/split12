import { test, expect, openUrl, pane, site } from './fixtures';

test('R-46 番号を境界にドラッグして移動でき、交点では移動せず右クリックに移動項目がない', async ({ split }) => {
  const before = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  for (const target of [split.getByRole('button', { name: '境界の交点', exact: true })]) {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height * (await target.getAttribute('aria-label') === '境界の交点' ? .5 : .6);
    await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await split.mouse.down(); await split.mouse.move(x, y, { steps: 12 }); await split.mouse.up();
    for (let i = 0; i < 4; i++) expect(await pane(split, i).boundingBox()).toEqual(before[i]);
    await expect(split.locator('.number-moving, .number-drop-target')).toHaveCount(0);
  }
  const divider = (await split.getByRole('button', { name: '左右の境界', exact: true }).nth(1).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(divider.x + divider.width / 2, divider.y + divider.height * .6, { steps: 12 }); await split.mouse.up();
  const top = (await pane(split, 0).boundingBox())!, moved = (await pane(split, 1).boundingBox())!;
  const left = (await pane(split, 2).boundingBox())!, right = (await pane(split, 3).boundingBox())!;
  expect(top.width).toBeCloseTo(left.width + moved.width + right.width, 0);
  expect(moved.x).toBeCloseTo(left.x + left.width, 0);
  expect(right.x).toBeCloseTo(moved.x + moved.width, 0);
  expect(moved.width).toBeCloseTo(left.width, 0);
  expect(right.width).toBeCloseTo(moved.width, 0);
  await pane(split, 1).locator('.pane-number').click({ button: 'right' });
  await expect(split.getByRole('menuitem', { name: '固定タブに選択' })).toBeVisible();
  await expect(split.getByRole('menuitem', { name: '境界線へ移動' })).toHaveCount(0);
});

test('R-43 数字タブ同士の交換と境界線のサイズ変更が引き続き動く', async ({ split }) => {
  const first = (await pane(split, 0).locator('.pane-number').boundingBox())!;
  const second = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  const beforeFirst = (await pane(split, 0).boundingBox())!;
  await split.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await split.mouse.down(); await split.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 12 }); await split.mouse.up();
  expect((await pane(split, 0).boundingBox())!.x).not.toBe(beforeFirst.x);
  const line = split.getByRole('button', { name: '左右の境界', exact: true }).nth(1);
  const box = (await line.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height * .6;
  await split.mouse.move(x, y); await split.mouse.down(); await split.mouse.move(x + 70, y, { steps: 10 }); await split.mouse.up();
  expect((await line.boundingBox())!.x).toBeGreaterThan(box.x + 50);
});

test('R-46 境界移動はページを保持しUndo・Redoと再読み込みで配置を維持する', async ({ split }) => {
  for (let i = 0; i < 4; i++) {
    await openUrl(split, i, site(i % 2 ? 'b' : 'a', `/token?restore=${i}`));
    await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toBeVisible();
  }
  const tokens = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).frameLocator('iframe').getByTestId('token').textContent()));
  const before = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  const source = (await pane(split, 1).locator('.pane-number').boundingBox())!;
  const divider = (await split.getByRole('button', { name: '左右の境界', exact: true }).nth(1).boundingBox())!;
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down(); await split.mouse.move(divider.x + divider.width / 2, divider.y + divider.height * .6, { steps: 12 }); await split.mouse.up();
  const moved = await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()));
  expect(moved).not.toEqual(before);
  for (let i = 0; i < 4; i++) await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(before);
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(moved);
  await split.reload();
  expect(await Promise.all([0, 1, 2, 3].map(i => pane(split, i).boundingBox()))).toEqual(moved);
  for (let i = 0; i < 4; i++) await expect(pane(split, i).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site(i % 2 ? 'b' : 'a', `/token?restore=${i}`));
});
