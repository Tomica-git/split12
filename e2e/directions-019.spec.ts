import { test, expect, openUrl, pane, site } from './fixtures';

type ContextMenuHooks = { handleContextMenu(info: { menuItemId: string; linkUrl: string }, tab?: chrome.tabs.Tab): Promise<boolean> };

for (const direction of ['left', 'right', 'up', 'down'] as const) {
  test(`R-34 右クリックで固定枠の${direction}へ追加しUndoと再読み込みで保持する`, async ({ split, sw }) => {
    await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
    await openUrl(split, 1, site('a', '/token?fixed=1'));
    await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toBeVisible();
    const token = await pane(split, 1).frameLocator('iframe').getByTestId('token').textContent();
    await pane(split, 1).locator('.pane-number').click({ button: 'right' });
    await split.getByRole('menuitem', { name: '固定タブに選択' }).click();
    await pane(split, 0).getByRole('combobox', { name: 'アドレス' }).click();
    expect(await sw.evaluate(async ({ url, direction, splitUrl }) => {
      const tab = (await chrome.tabs.query({})).find(item => item.url === splitUrl)!;
      const hooks = (globalThis as unknown as { __split8Test: ContextMenuHooks }).__split8Test;
      return hooks.handleContextMenu({ menuItemId: `split8-link-${direction}`, linkUrl: url }, tab);
    }, { url: site('b', `/page2?direction=${direction}`), direction, splitUrl: split.url() })).toBe(true);
    await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
    const fixed = (await pane(split, 1).boundingBox())!, added = (await pane(split, 2).boundingBox())!;
    if (direction === 'left') expect(added.x + added.width).toBeLessThanOrEqual(fixed.x + 1);
    if (direction === 'right') expect(added.x).toBeGreaterThanOrEqual(fixed.x + fixed.width - 1);
    if (direction === 'up') expect(added.y + added.height).toBeLessThanOrEqual(fixed.y + 1);
    if (direction === 'down') expect(added.y).toBeGreaterThanOrEqual(fixed.y + fixed.height - 1);
    await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
    await split.getByRole('button', { name: '変更を元に戻す', exact: true }).click();
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
    await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
    await split.getByRole('button', { name: '変更をやり直す', exact: true }).click();
    await expect(pane(split, 2).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('b', `/page2?direction=${direction}`));
    await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { count?: number } | undefined)?.count)).toBe(3);
    await split.reload();
    await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
    const restoredFixed = (await pane(split, 1).boundingBox())!, restoredAdded = (await pane(split, 2).boundingBox())!;
    if (direction === 'left') expect(restoredAdded.x + restoredAdded.width).toBeLessThanOrEqual(restoredFixed.x + 1);
    if (direction === 'right') expect(restoredAdded.x).toBeGreaterThanOrEqual(restoredFixed.x + restoredFixed.width - 1);
    if (direction === 'up') expect(restoredAdded.y + restoredAdded.height).toBeLessThanOrEqual(restoredFixed.y + 1);
    if (direction === 'down') expect(restoredAdded.y).toBeGreaterThanOrEqual(restoredFixed.y + restoredFixed.height - 1);
  });
}

for (const direction of ['left', 'up'] as const) {
  test(`R-34 分割ビュー未起動でも${direction}方向を引き継ぎ不正URLは拒否する`, async ({ context, sw, extensionId }) => {
    const add = (url: string) => sw.evaluate(({ url, direction }) => {
      const hooks = (globalThis as unknown as { __split8Test: ContextMenuHooks }).__split8Test;
      return hooks.handleContextMenu({ menuItemId: `split8-link-${direction}`, linkUrl: url });
    }, { url, direction });
    expect(await add('javascript:alert(1)')).toBe(false);
    expect(context.pages().filter(page => page.url().includes('/split.html'))).toHaveLength(0);
    expect(await add(site('a', '/plain?from-context'))).toBe(true);
    await expect.poll(() => context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))?.url()).toBeTruthy();
    const split = context.pages().find(page => page.url().startsWith(`chrome-extension://${extensionId}/split.html`))!;
    await expect(pane(split, 4).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
    await expect.poll(() => split.url()).not.toContain('before=');
    const fixed = (await pane(split, 0).boundingBox())!, added = (await pane(split, 4).boundingBox())!;
    if (direction === 'left') expect(added.x + added.width).toBeLessThanOrEqual(fixed.x + 1);
    else expect(added.y + added.height).toBeLessThanOrEqual(fixed.y + 1);
  });
}
