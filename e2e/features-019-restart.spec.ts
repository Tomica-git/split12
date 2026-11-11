import { test, expect, launch, openUrl, pane, site } from './fixtures';
import type { Page } from '@playwright/test';

async function expectMovedLayout(page: Page): Promise<void> {
  const top = (await pane(page, 0).boundingBox())!;
  const moved = (await pane(page, 1).boundingBox())!;
  const left = (await pane(page, 2).boundingBox())!;
  const right = (await pane(page, 3).boundingBox())!;
  expect(top.width).toBeCloseTo(left.width + moved.width + right.width, 0);
  expect(top.y + top.height).toBeCloseTo(moved.y, 0);
  expect(left.y).toBeCloseTo(moved.y, 0);
  expect(right.y).toBeCloseTo(moved.y, 0);
  expect(moved.x).toBeCloseTo(left.x + left.width, 0);
  expect(right.x).toBeCloseTo(moved.x + moved.width, 0);
  expect(left.width).toBeCloseTo(moved.width, 0);
  expect(right.width).toBeCloseTo(moved.width, 0);
}

test('R-43 R-09 旧バージョンの境界移動配置・固定枠・URLはブラウザ再起動後も復元する', async ({ profile }) => {
  let context = await launch(profile);
  try {
    let sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const splitUrl = `chrome-extension://${new URL(sw.url()).host}/split.html`;
    let split = await context.newPage();
    await split.goto(splitUrl);
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    const urls = [0, 1, 2, 3].map(index => site(index % 2 ? 'b' : 'a', `/plain?restart-move=${index}`));
    for (let index = 0; index < urls.length; index++) {
      await openUrl(split, index, urls[index]!);
      await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
    }
    await pane(split, 2).locator('.pane-number').click({ button: 'right' });
    await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
    await expect(pane(split, 2)).toHaveClass(/fixed/);
    // Simulate a layout saved by 0.1.9 before the boundary-move gesture was removed.
    await split.evaluate(async () => {
      const workspace = (await chrome.storage.local.get('workspace')).workspace as { layout: unknown };
      workspace.layout = { axis: 'y', ratio: .5, first: { pane: 0 }, second: {
        axis: 'x', ratio: 1 / 3, first: { pane: 2 }, second: {
          axis: 'x', ratio: .5, first: { pane: 1 }, second: { pane: 3 },
        },
      } };
      await chrome.storage.local.set({ workspace });
    });
    await split.reload();
    await expectMovedLayout(split);
    await expect.poll(async () => split.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { fixedSlot?: number } | undefined)?.fixedSlot)).toBe(2);
    await context.close();

    context = await launch(profile);
    sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    expect(new URL(sw.url()).host).toBe(new URL(splitUrl).host);
    split = await context.newPage();
    await split.goto(splitUrl);
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    await expectMovedLayout(split);
    await expect(pane(split, 2)).toHaveClass(/fixed/);
    for (let index = 0; index < urls.length; index++) {
      await expect(pane(split, index).getByRole('combobox', { name: 'アドレス' })).toHaveValue(urls[index]!);
      await expect(pane(split, index).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
    }
  } finally {
    await context.close();
  }
});
