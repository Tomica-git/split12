import { test as base, expect, openUrl, pane, site } from './fixtures';
import { localTlsContext } from './fixtures/tls';

const test = base.extend({
  context: async ({ profile }, use) => {
    const fixture = await localTlsContext(profile, ['www.google.com'], (_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<main data-testid="search-result">search-result</main>');
    });
    try { await use(fixture.context); } finally { await fixture.close(); }
  },
});

test('R-21 URL欄に開いているタブの候補を出し選ぶと同じ枠で開く', async ({ split, context }) => {
  const url = site('b', '/page2?suggest');
  const tab = await context.newPage(); await tab.goto(url); await split.bringToFront();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.fill('b.test');
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list).toBeVisible();
  await list.getByRole('option', { name: /b\.test:4178\/page2\?suggest/ }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(input).toHaveValue(url);
});

test('R-22 Google検索を入力したSplit8の枠内で開き別タブや枠を増やさない', async ({ split, context }) => {
  await openUrl(split, 1, site('a', '/token?other'));
  const token = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
  const pages = context.pages().length;
  await openUrl(split, 0, 'Gmail');
  await pane(split, 0).getByRole('button', { name: 'Google で検索', exact: true }).click();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('https://www.google.com/search?q=Gmail');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('search-result')).toHaveText('search-result');
  expect(context.pages()).toHaveLength(pages);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-20 R-23 Shift選択した2本の境界を同じ移動量でドラッグできる', async ({ split }) => {
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  const before = [(await handles.nth(0).boundingBox())!, (await handles.nth(1).boundingBox())!];
  await split.mouse.move(before[0]!.x + 4, before[0]!.y + 20); await split.mouse.down();
  await split.mouse.move(before[0]!.x + 84, before[0]!.y + 20, { steps: 5 }); await split.mouse.up();
  const after = [(await handles.nth(0).boundingBox())!, (await handles.nth(1).boundingBox())!];
  expect(after[0]!.x - before[0]!.x).toBeGreaterThan(60);
  expect(after[1]!.x - before[1]!.x).toBeCloseTo(after[0]!.x - before[0]!.x, 0);
});

test('R-20 R-23 複数選択した境界をまとめてダブルクリック反転できる', async ({ split }) => {
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  const before = [(await pane(split, 0).boundingBox())!, (await pane(split, 2).boundingBox())!];
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await handles.nth(0).dblclick({ position: { x: 4, y: 20 } });
  expect((await pane(split, 0).boundingBox())!.x).toBeGreaterThan(before[0]!.x + 100);
  expect((await pane(split, 2).boundingBox())!.x).toBeGreaterThan(before[1]!.x + 100);
});

test('R-21 R-22 日本語変換中のEnterを無視し候補を上下・Enter・Escで操作できる', async ({ split, context }) => {
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.fill('にほん');
  await input.evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  });
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
  await expect(pane(split, 0).locator('.overlay')).toBeHidden();
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await input.fill('日本語 検索');
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list.getByRole('option')).toHaveCount(1);
  await input.press('ArrowDown'); await expect(list.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape'); await expect(list).toBeHidden(); await expect(input).toHaveValue('日本語 検索');
  await input.fill('日本語 検索2'); await expect(list.getByRole('option')).toHaveCount(1);
  const pages = context.pages().length;
  await input.press('ArrowUp'); await input.press('Enter');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('search-result')).toHaveText('search-result');
  expect(new URL(await input.inputValue()).searchParams.get('q')).toBe('日本語 検索2');
  expect(context.pages()).toHaveLength(pages);
});

test('R-21 候補は細い枠に切られず画面内に収まり古い入力を表示しない', async ({ split }, testInfo) => {
  await split.setViewportSize({ width: 1050, height: 700 });
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('12'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const input = pane(split, 10).getByRole('combobox', { name: 'アドレス' });
  await input.fill('goo'); await input.fill('note');
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list).toBeVisible(); await expect(list.getByRole('option', { name: /https:\/\/note\.com\// })).toBeVisible();
  await expect(list.getByRole('option', { name: /https:\/\/www\.google\.com\/$/ })).toHaveCount(0);
  const box = (await list.boundingBox())!, owner = (await pane(split, 10).boundingBox())!;
  expect(box.width).toBeGreaterThan(owner.width); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(1050);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(700);
  await split.screenshot({ path: testInfo.outputPath('suggestions-narrow.png') });
});

test('R-21 R-03 レイアウト変更とEscで入力途中の文字や他のページを消さない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?typing'));
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.fill('入力中の検索');
  await expect(split.getByRole('listbox', { name: 'アドレスの候補' })).toBeVisible();
  await input.press('Escape'); await expect(input).toHaveValue('入力中の検索');
  await split.getByRole('button', { name: '縦並び', exact: false }).click();
  await expect(input).toHaveValue('入力中の検索');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter'); await expect(input).toHaveValue('入力中の検索');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});

test('R-23 R-16 グループ移動はUndo1件で戻り保存され生存フレームを保つ', async ({ split, sw }) => {
  await openUrl(split, 0, site('a', '/token?group0')); await openUrl(split, 2, site('b', '/token?group2'));
  const tokens = await Promise.all([0, 2].map(index => pane(split, index).frameLocator('iframe').getByTestId('token').textContent()));
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } }); await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  const initial = (await handles.nth(0).boundingBox())!;
  await split.mouse.move(initial.x + 4, initial.y + 20); await split.mouse.down(); await split.mouse.move(initial.x + 84, initial.y + 20, { steps: 6 }); await split.mouse.up();
  const moved = (await handles.nth(0).boundingBox())!;
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  expect((await handles.nth(0).boundingBox())!.x).toBeCloseTo(initial.x, 0); expect((await handles.nth(1).boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
  await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
  expect((await handles.nth(0).boundingBox())!.x).toBeCloseTo(moved.x, 0);
  for (const [i, index] of [0, 2].entries()) await expect(pane(split, index).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
  const grid = (await split.locator('.grid').boundingBox())!, ratio = (moved.x + 4 - grid.x) / grid.width;
  await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { layout: { first: { ratio: number } } }).layout.first.ratio)).toBeCloseTo(ratio, 3);
  await split.reload(); expect((await handles.nth(0).boundingBox())!.x).toBeCloseTo(moved.x, 0);
});

test('R-23 親子の境界も同じ画面上の量で動き一括反転とUndoができる', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter'); await split.getByRole('button', { name: '横並び', exact: false }).click();
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } }); await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  const before = [(await handles.nth(0).boundingBox())!, (await handles.nth(1).boundingBox())!];
  await split.mouse.move(before[0]!.x + 4, before[0]!.y + 20); await split.mouse.down(); await split.mouse.move(before[0]!.x + 74, before[0]!.y + 20, { steps: 4 }); await split.mouse.up();
  expect((await handles.nth(1).boundingBox())!.x - before[1]!.x).toBeCloseTo((await handles.nth(0).boundingBox())!.x - before[0]!.x, 0);
  await handles.nth(0).dblclick({ position: { x: 4, y: 20 } });
  const order = await Promise.all([0, 1, 2].map(async index => ({ index, x: (await pane(split, index).boundingBox())!.x })));
  expect(order.sort((a, b) => a.x - b.x).map(item => item.index)).toEqual([2, 1, 0]);
  await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
  const restored = await Promise.all([0, 1, 2].map(async index => ({ index, x: (await pane(split, index).boundingBox())!.x })));
  expect(restored.sort((a, b) => a.x - b.x).map(item => item.index)).toEqual([0, 1, 2]);
});

for (const ending of ['Escape', 'pointercancel', 'blur'] as const) test(`R-23 複数境界のドラッグを${ending}で取り消せる`, async ({ split }) => {
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } }); await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  const before = (await handles.nth(0).boundingBox())!;
  await split.mouse.move(before.x + 4, before.y + 20); await split.mouse.down(); await split.mouse.move(before.x + 84, before.y + 20, { steps: 4 });
  if (ending === 'Escape') await split.keyboard.press('Escape');
  else await split.evaluate(type => window.dispatchEvent(type === 'blur' ? new Event(type) : new PointerEvent(type)), ending);
  await split.mouse.up();
  expect((await handles.nth(0).boundingBox())!.x).toBeCloseTo(before.x, 0); expect((await handles.nth(1).boundingBox())!.x).toBeCloseTo(before.x, 0);
  await expect(split.getByRole('button', { name: '変更を元に戻す', exact: true })).toBeDisabled();
});

test('R-21 タブ情報が更新されても選択中の候補を保ちEsc後に勝手に開き直さない', async ({ split, context }) => {
  const url = site('b', '/page2?metadata');
  const tab = await context.newPage(); await tab.goto(url); await split.bringToFront();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.fill(url);
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list.getByRole('option')).toHaveCount(1);
  await input.press('ArrowDown');
  await tab.evaluate(() => { document.title = 'Updated candidate'; });
  await expect(list.getByRole('option')).toContainText('Updated candidate');
  await expect(list.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await tab.evaluate(() => { document.title = 'Updated after Escape'; });
  // Wait for the product's tab cache by observing its visible empty-pane tab picker, not an arbitrary sleep.
  await expect(pane(split, 1).locator('.tab-pick').filter({ hasText: 'Updated after Escape' })).toBeVisible();
  await expect(list).toBeHidden();
});

test('R-23 親子反転のあと選択を解除し次の単体ドラッグを受け付ける', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter'); await split.getByRole('button', { name: '横並び', exact: false }).click();
  const handles = split.getByRole('button', { name: '左右の境界', exact: true });
  await handles.nth(0).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } }); await handles.nth(1).click({ modifiers: ['Shift'], position: { x: 4, y: 20 } });
  await handles.nth(0).dblclick({ position: { x: 4, y: 20 } });
  await expect(split.locator('.split-divider[aria-pressed="true"]')).toHaveCount(0);
  const box = (await handles.nth(0).boundingBox())!;
  await split.mouse.move(box.x + 4, box.y + 20); await split.mouse.down(); await split.mouse.move(box.x + 64, box.y + 20, { steps: 4 }); await split.mouse.up();
  expect((await handles.nth(0).boundingBox())!.x).toBeGreaterThan(box.x + 40);
});

test('R-21 候補待機中のEscを入力欄で処理し遅れて開かない', async ({ split }) => {
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' }); await input.focus();
  const consumed = await input.evaluate(element => {
    (element as HTMLInputElement).value = 'note';
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return !element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  expect(consumed).toBe(true);
  // Negative check: allow the 80 ms candidate debounce to elapse and prove that nothing opens later.
  await split.waitForTimeout(150);
  await expect(split.getByRole('listbox', { name: 'アドレスの候補' })).toBeHidden();
  await expect(input).toHaveValue('note');
});

test('R-21 S-06 候補選択後に入力を変えた直後のEnterで古い候補を開かない', async ({ split, context }) => {
  const url = site('b', '/page2?old-candidate');
  const tab = await context.newPage(); await tab.goto(url); await split.bringToFront();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.fill(url); await expect(split.getByRole('listbox', { name: 'アドレスの候補' }).getByRole('option')).toHaveCount(1); await input.press('ArrowDown');
  await input.evaluate(element => {
    (element as HTMLInputElement).value = 'javascript:alert(1)';
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
  await expect(pane(split, 0).getByRole('button', { name: 'Google で検索', exact: true })).toHaveCount(0);
});
