import { test, expect, openUrl, pane, site, moveIntoFrame } from './fixtures';

test('R-68 新しいタブのリンクを取り込まず手動で追加できる', async ({ split, context }) => {
  const url = site('a', '/page2?normal=1');
  await openUrl(split, 0, site('a', `/link?new=1&to=${encodeURIComponent(url)}`));
  await moveIntoFrame(split, 0);
  const created = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('link').click();
  const tab = await created;
  await expect(tab.getByTestId('marker')).toHaveText('page2');
  await split.waitForTimeout(1000); // Verify no asynchronous import or tab removal.
  expect(tab.isClosed()).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '開いているタブから追加' }).click();
  const dialog = split.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: /Fixture \/page2/ }).check();
  await dialog.getByRole('button', { name: /追加/ }).click();
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  expect(tab.isClosed()).toBe(false);
});

for (const [key, axis, before] of [['W', 'y', true], ['A', 'x', true], ['S', 'y', false], ['D', 'x', false]] as const) {
  test(`R-69 Cmd Shift ${key} で固定枠の指定方向に追加する`, async ({ split }) => {
    const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
    await count.fill('1'); await count.press('Enter');
    await split.keyboard.press(`Meta+Shift+${key}`);
    await expect(count).toHaveValue('2');
    const fixed = (await pane(split, 0).boundingBox())!;
    const added = (await pane(split, 1).boundingBox())!;
    expect(before ? added[axis] < fixed[axis] : added[axis] > fixed[axis]).toBe(true);
  });
}

test('R-69 四方向のコマンドを Chrome の設定に登録できる', async ({ sw }) => {
  const commands = await sw.evaluate(() => chrome.commands.getAll());
  for (const name of ['split-up', 'split-left', 'split-down', 'split-right']) expect(commands.some(command => command.name === name)).toBe(true);
});

test('R-69 サイト内のキー入力でも固定枠の右へ一度だけ追加する', async ({ split }) => {
  const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
  await count.fill('1'); await count.press('Enter');
  await openUrl(split, 0, site('a', '/plain'));
  await moveIntoFrame(split, 0);
  await pane(split, 0).frameLocator('iframe').getByTestId('marker').click();
  await split.keyboard.press('Meta+Shift+D');
  await expect(count).toHaveValue('2');
  await split.waitForTimeout(500); // Check the frame bridge did not execute twice.
  await expect(count).toHaveValue('2');
  expect((await pane(split, 1).boundingBox())!.x).toBeGreaterThan((await pane(split, 0).boundingBox())!.x);
});

test('R-69 変更可能な四方向コマンドは対象ビューに作用する', async ({ split, sw }) => {
  const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
  await count.fill('1'); await count.press('Enter');
  await sw.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(item => item.url === url)!;
    await (globalThis as unknown as { __split8Test: { handleCommand(command: string, tab: chrome.tabs.Tab): Promise<void> } }).__split8Test.handleCommand('split-left', tab);
  }, split.url());
  await expect(count).toHaveValue('2');
  expect((await pane(split, 1).boundingBox())!.x).toBeLessThan((await pane(split, 0).boundingBox())!.x);
});

test('R-70 操作ボタンは指定順で左側に並ぶ', async ({ split }) => {
  const classes = await split.locator('.toolbar').evaluate(element => Array.from(element.children).map(child => child.className));
  const indices = ['sidebar-toggle', 'count-group', 'split-group', 'undo', 'redo', 'pane-list-open', 'direction-group', 'toolbar-spacer'].map(name => classes.findIndex(value => value.split(' ').includes(name)));
  expect(indices.every((value, index) => value >= 0 && (!index || indices[index - 1]! < value))).toBe(true);
  const list = (await split.getByRole('button', { name: '一覧', exact: true }).boundingBox())!;
  const directions = (await split.getByRole('group', { name: '並び方' }).boundingBox())!;
  expect(directions.x).toBeGreaterThan(list.x + list.width - 1);
});

test('R-68 Command クリックでも通常タブが残り分割数は変わらない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/link?to=${encodeURIComponent(site('a', '/page2?command=1'))}`));
  await moveIntoFrame(split, 0);
  const created = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('link').click({ modifiers: ['Meta'] });
  const tab = await created;
  await expect(tab.getByTestId('marker')).toHaveText('page2');
  await split.waitForTimeout(1000); // Confirm no delayed import.
  expect(tab.isClosed()).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-68 遅い新規タブも読み込み後に閉じず元枠を保つ', async ({ split, context }) => {
  await openUrl(split, 0, site('a', `/link?new=1&to=${encodeURIComponent(site('a', '/slow'))}`));
  await moveIntoFrame(split, 0);
  const created = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('link').click();
  const tab = await created;
  await expect(tab.getByTestId('marker')).toHaveText('slow');
  await split.waitForTimeout(1000); // Confirm no delayed closing.
  expect(tab.isClosed()).toBe(false);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
});
