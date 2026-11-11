import { test, expect, openUrl, pane, site, createNewView } from './fixtures';

test('R-33 固定枠の四辺を点線で囲み選択枠と区別する', async ({ split }, testInfo) => {
  await openUrl(split, 1, site('a', '/plain'));
  const fixed = pane(split, 1);
  await expect(fixed.frameLocator('iframe').getByTestId('marker')).toBeVisible();
  await fixed.locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
  await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
  await expect(fixed).toHaveClass(/fixed/);
  await expect(fixed).not.toHaveClass(/active/);
  const frameStyle = await fixed.evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { styles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle], width: style.borderTopWidth, z: style.zIndex, pointerEvents: style.pointerEvents };
  });
  expect(frameStyle).toEqual({ styles: ['dashed', 'dashed', 'dashed', 'dashed'], width: '2px', z: '4', pointerEvents: 'none' });
  await fixed.getByRole('combobox', { name: 'アドレス' }).click();
  await expect(fixed).toHaveClass(/active/);
  await expect.poll(() => fixed.evaluate(element => getComputedStyle(element, '::before').boxShadow)).not.toBe('none');
  await split.emulateMedia({ colorScheme: 'dark' });
  await split.screenshot({ path: testInfo.outputPath('fixed-pane-dark.png') });
  await split.reload();
  await expect(pane(split, 1)).toHaveClass(/fixed/);
});

test('R-36 R-37 R-38 R-40 アイコンとセッション一覧からのビュー作成', async ({ split, context }) => {
  const group = split.getByRole('group', { name: '固定タブに追加' });
  const names = ['左に追加', '右に追加（左右に追加）', '上に追加', '下に追加（上下に追加）'];
  for (const name of names) {
    const button = group.getByRole('button', { name, exact: true });
    await expect(button.locator('svg')).toHaveCount(1);
    await expect(button).toHaveAttribute('title', /固定タブの.+に追加/);
  }
  const order = await split.locator('.toolbar').evaluate(bar => {
    const children = [...bar.children];
    return ['.current-view', '.sidebar-toggle', '.count-group'].map(selector => children.indexOf(bar.querySelector(selector)!));
  });
  expect(order[0]).toBeLessThan(order[1]!);
  expect(order[1]).toBeLessThan(order[2]!);
  await expect(split.locator('.toolbar .new-view, .toolbar .shortcuts')).toHaveCount(0);
  await split.getByRole('button', { name: 'セッション一覧', exact: true }).click();
  const created = context.waitForEvent('page');
  await createNewView(split);
  const page = await created;
  await expect(page.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await page.close();
  await split.getByRole('button', { name: '設定', exact: true }).click();
  await expect(split.getByRole('dialog').getByRole('button', { name: 'ショートカットを変更' })).toBeVisible();
});
