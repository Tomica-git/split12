import { test, expect, createNewView, openSessions, openUrl, pane, site } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function loadAll(split: Page): Promise<void> {
  for (const index of [0, 1, 2, 3]) {
    await openUrl(split, index, site('a', `/plain?drag=${index}`));
    await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  }
}
// One jump from the press point straight over a loaded page, then release: the case that used to be dropped.
async function jump(split: Page, handle: Locator, dx: number, dy: number, at?: { x: number; y: number }): Promise<void> {
  const box = (await handle.boundingBox())!;
  const x = at ? box.x + at.x : box.x + box.width / 2, y = at ? box.y + at.y : box.y + box.height / 2;
  await split.mouse.move(x, y); await split.mouse.down();
  await split.mouse.move(x + dx, y + dy, { steps: 1 });
  await split.mouse.up();
}

test('R-92 ページを開いた枠の上へ一気に動かして離しても交点のドラッグを確定する', async ({ split }) => {
  await loadAll(split);
  const before = (await pane(split, 0).boundingBox())!;
  await jump(split, split.locator('.split-junction').first(), 120, 80);
  await expect.poll(async () => Math.round((await pane(split, 0).boundingBox())!.width)).toBe(Math.round(before.width + 120));
  expect(Math.round((await pane(split, 0).boundingBox())!.height)).toBe(Math.round(before.height + 80));
  await expect(split.locator('#app')).not.toHaveClass(/pointer-shield/);
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  await expect.poll(async () => Math.round((await pane(split, 0).boundingBox())!.width)).toBe(Math.round(before.width));
});

test('R-92 ページを開いた枠の上へ一気に動かして離しても境界線と番号のドラッグを確定する', async ({ split }) => {
  await loadAll(split);
  const height = (await pane(split, 0).boundingBox())!.height;
  const line = split.getByRole('button', { name: '上下の境界', exact: true }).first();
  const lineBox = (await line.boundingBox())!;
  await jump(split, line, 0, 90, { x: lineBox.width * .25, y: lineBox.height / 2 });
  await expect.poll(async () => Math.round((await pane(split, 0).boundingBox())!.height)).toBe(Math.round(height + 90));
  const a = (await pane(split, 0).boundingBox())!, d = (await pane(split, 3).boundingBox())!;
  const number = pane(split, 0).locator('.pane-number'), numberBox = (await number.boundingBox())!;
  await jump(split, number, d.x + d.width / 2 - (numberBox.x + numberBox.width / 2), d.y + d.height / 2 - (numberBox.y + numberBox.height / 2));
  await expect.poll(async () => Math.round((await pane(split, 0).boundingBox())!.x)).toBe(Math.round(d.x));
  await expect.poll(async () => Math.round((await pane(split, 3).boundingBox())!.x)).toBe(Math.round(a.x));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-93 別のウィンドウで開いているビューを選ぶとそのタブを前に出し、このタブは切り替えない', async ({ split, context }) => {
  await openSessions(split);
  const opened = context.waitForEvent('page');
  await createNewView(split);
  const other = await opened;
  await openUrl(other, 0, site('b', '/page2?other-window'));
  await expect(pane(other, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  const here = split.url(), pages = context.pages().length;
  const rows = split.getByRole('complementary', { name: 'セッション' }).locator('.view-choice');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).dblclick();
  await expect.poll(() => other.evaluate(async () => (await chrome.tabs.getCurrent())!.active)).toBe(true);
  expect(split.url()).toBe(here);
  expect(context.pages()).toHaveLength(pages);
});

test('R-94 空の枠で開いているタブを選ぶと枠に表示し、読み込めたら元のタブを閉じる', async ({ split, context }) => {
  const source = await context.newPage(); await source.goto(site('b', '/plain?moved'));
  await split.bringToFront();
  const choice = pane(split, 1).getByRole('list', { name: '開いているタブ' }).getByRole('listitem').filter({ hasText: 'b.test' });
  await expect(choice).toHaveCount(1);
  const closed = source.waitForEvent('close');
  await choice.click();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await closed;
  expect(source.isClosed()).toBe(true);
  await expect(pane(split, 1).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', '/plain?moved'));
});

test('R-94 固定したタブと読み込めなかったタブは閉じない', async ({ split, context, sw }) => {
  const pinned = await context.newPage(); await pinned.goto(site('b', '/plain?pinned'));
  await sw.evaluate(async url => { const tab = (await chrome.tabs.query({})).find(item => item.url === url)!; await chrome.tabs.update(tab.id!, { pinned: true }); }, site('b', '/plain?pinned'));
  await context.route('http://c.test:4178/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main data-testid="marker">c</main>' }));
  const failing = await context.newPage(); await failing.goto('http://c.test:4178/plain?fails');
  await context.unroute('http://c.test:4178/**');
  await context.route('http://c.test:4178/**', route => route.abort('connectionrefused'));
  await split.bringToFront();
  const list = (index: number) => pane(split, index).getByRole('list', { name: '開いているタブ' });
  await list(1).getByRole('listitem').filter({ hasText: 'b.test' }).click();
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await list(2).getByRole('listitem').filter({ hasText: 'c.test' }).click();
  await expect(pane(split, 2).getByText(/読み込みに失敗しました/)).toBeVisible();
  await split.waitForTimeout(500);
  expect(pinned.isClosed()).toBe(false);
  expect(failing.isClosed()).toBe(false);
});
