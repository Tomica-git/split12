import { expect, test } from 'vitest';
import { closeWorkspacePane, OperationHistory, workspaceTree } from './workspaceOperations';
import { defaultWorkspace, parseWorkspace, workspaceOrder } from './workspace';
import { measureTree, validTree } from './splitTree';

test('R-15 中間を閉じても実体IDと非表示の保存ページを保ち表示順だけ詰める', () => {
  const original = defaultWorkspace();
  original.panes[0]!.url = 'https://a.test/'; original.panes[2]!.url = 'https://c.test/'; original.panes[8]!.url = 'https://hidden.test/';
  const closed = closeWorkspacePane(original, 1);
  expect(closed.count).toBe(3);
  expect(workspaceOrder(closed).slice(0, 3)).toEqual([0, 2, 3]);
  expect(workspaceOrder(closed).at(-1)).toBe(1);
  expect(closed.panes[8]!.url).toBe('https://hidden.test/');
  expect([...measureTree(workspaceTree(closed)).panes.keys()].sort()).toEqual([0, 2, 3]);
  expect(validTree(closed.layout, 3, [0, 2, 3])).toBe(true);
  expect(original.count).toBe(4);
});
test('R-15 最後の1枠は空欄にし、非表示や不正なIDは閉じない', () => {
  const workspace = defaultWorkspace(); workspace.count = 1; workspace.panes[0] = { url: 'https://a.test/', zoom: .67 };
  expect(closeWorkspacePane(workspace, 0).count).toBe(1);
  expect(closeWorkspacePane(workspace, 0).panes[0]!.url).toBe('');
  expect(closeWorkspacePane(workspace, 0).panes[0]!.zoom).toBe(1);
  expect(closeWorkspacePane(workspace, 1)).toBe(workspace);
  expect(closeWorkspacePane(workspace, -1)).toBe(workspace);
});
test('R-09 R-15 非連続IDの配置と表示順を保存復元し、不正な順列を使わない', () => {
  const workspace = closeWorkspacePane(defaultWorkspace(), 1);
  const restored = parseWorkspace(JSON.parse(JSON.stringify(workspace)));
  expect(workspaceOrder(restored)).toEqual(workspaceOrder(workspace));
  expect(restored.layout).toEqual(workspace.layout);
  const invalid = parseWorkspace({ ...workspace, order: Array(12).fill(0) });
  expect(workspaceOrder(invalid)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  expect(invalid.layout).toBeUndefined();
});
test('R-16 戻す・進むは順序を守り、新しい変更でやり直しを破棄する', () => {
  const history = new OperationHistory<string>();
  history.record('A'); history.record('B');
  expect(history.undo()).toBe('B'); expect(history.undo()).toBe('A');
  expect(history.redo()).toBe('A');
  history.record('C'); expect(history.canRedo).toBe(false);
  expect(history.undo()).toBe('C');
});
test('R-16 変更履歴は最大50件に制限する', () => {
  const history = new OperationHistory<number>();
  for (let i = 1; i <= 60; i++) history.record(i);
  const values = []; while (history.canUndo) values.push(history.undo());
  expect(values).toHaveLength(50); expect(values.at(-1)).toBe(11);
  history.clear(); expect(history.canRedo).toBe(false);
});
