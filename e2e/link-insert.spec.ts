import { test, expect, openUrl, pane, site, moveIntoFrame } from './fixtures';

test('R-79 URLを境界にドロップすると既存ページを保ち1枠増える', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await pane(split, 0).locator('iframe').evaluate(element => { (element as HTMLIFrameElement & { preserved?: boolean }).preserved = true; });
  const divider = split.locator('.split-divider').first();
  const box = (await divider.boundingBox())!;
  const x = box.x + box.width * (box.width > box.height ? .25 : .5);
  const y = box.y + box.height * (box.height > box.width ? .25 : .5);
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  expect(await pane(split, 0).locator('iframe').evaluate(element => (element as HTMLIFrameElement & { preserved?: boolean }).preserved)).toBe(true);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-79 ページ内リンクを境界へドラッグして新規枠を追加', async ({ split }) => {
  await openUrl(split, 0, site('a', '/link'));
  const link = pane(split, 0).frameLocator('iframe').getByTestId('link');
  await expect(link).toBeVisible();
  await moveIntoFrame(split, 0);
  const source = (await link.boundingBox())!;
  const box = (await split.locator('.split-divider').first().boundingBox())!;
  const x = box.x + box.width * (box.width > box.height ? .25 : .5);
  const y = box.y + box.height * (box.height > box.width ? .25 : .5);
  await split.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await split.mouse.down();
  await split.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await expect(split.locator('.link-drag-ghost')).toBeVisible();
  await split.mouse.move(x, y, { steps: 12 });
  await split.mouse.up();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

for (const place of ['枠の辺', '外周'] as const) test(`R-79 ${place}にドロップし新規枠を追加`, async ({ split, context }) => {
  const box = (await (place === '外周' ? split.locator('.grid') : pane(split, 0).locator('.pane-view')).boundingBox())!;
  const x = box.x + (place === '外周' ? 2 : 15), y = box.y + box.height * .35;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});

test('R-79 上限のときリンクを追加せず既存枠を維持', async ({ split, context }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('12');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const box = (await split.locator('.grid').boundingBox())!;
  const x = box.x + 2, y = box.y + box.height * .35;
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('12');
  await expect(split.getByRole('status')).toBeVisible();
});
