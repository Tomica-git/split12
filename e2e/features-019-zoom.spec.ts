import { test, expect, pane } from './fixtures';

test('R-39 日本語配列の信頼されたキー入力は選択枠のみを10ポイント変更し保存する', async ({ split, context }) => {
  const selected = pane(split, 1);
  await selected.getByRole('combobox', { name: 'アドレス' }).click();
  const cdp = await context.newCDPSession(split);
  const send = async (key: string, code: string, windowsVirtualKeyCode: number) => {
    const event = { key, code, windowsVirtualKeyCode, modifiers: 12 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  };
  await split.evaluate(() => {
    window.addEventListener('keydown', event => {
      if (event.metaKey && event.shiftKey && event.code === 'Semicolon') {
        document.body.dataset.jisKey = `${event.isTrusted}:${event.defaultPrevented}`;
      }
    });
  });
  await send('"', 'Quote', 222);
  await expect(selected.getByRole('button', { name: '表示倍率' })).toHaveText('110%');
  await send('+', 'Semicolon', 186);
  await expect(split.locator('body')).toHaveAttribute('data-jis-key', 'true:true');
  await expect(selected.getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await send('=', 'Minus', 189);
  await expect(selected.getByRole('button', { name: '表示倍率' })).toHaveText('90%');
  expect(await split.evaluate(async () => chrome.tabs.getZoom((await chrome.tabs.getCurrent())!.id!))).toBe(1);
  await send('"', 'Quote', 222);
  await split.reload();
  await expect(selected.getByRole('button', { name: '表示倍率' })).toHaveText('100%');
  await cdp.detach();
});
