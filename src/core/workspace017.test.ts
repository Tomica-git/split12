import { expect, test } from 'vitest';
import { defaultWorkspace, parseWorkspace, workspaceFixed, stepZoom } from './workspace';

test('R-24 古い保存は先頭の枠を固定し、有効な固定は順序変更や再読込でも保つ', () => {
  const workspace = defaultWorkspace();
  expect(workspaceFixed(parseWorkspace(workspace))).toBe(0);
  const stored = { ...workspace, fixedSlot: 2, order: [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
  expect(workspaceFixed(parseWorkspace(stored))).toBe(2);
  expect(workspaceFixed(parseWorkspace({ ...stored, fixedSlot: 8 }))).toBe(2);
});
test('R-26 10%刻みと旧67%を保存復元し、範囲外や不正値は既定値へ戻す', () => {
  const ws = defaultWorkspace();
  ws.panes[0]!.zoom = 1.2; ws.panes[1]!.zoom = .67; ws.panes[2]!.zoom = .77; ws.panes[3]!.zoom = 9;
  const restored = parseWorkspace(ws);
  expect(restored.panes.slice(0, 4).map(pane => pane.zoom)).toEqual([1.2, .67, .77, 1]);
});
test('R-26 倍率操作は10ポイント刻みで端を越えず浮動小数点誤差を残さない', () => {
  expect(stepZoom(1, 1)).toBe(1.1); expect(stepZoom(1.2, -1)).toBe(1.1);
  expect(stepZoom(.67, 1)).toBe(.77); expect(stepZoom(.67, -1)).toBe(.57);
  expect(stepZoom(.3, -1)).toBe(.3); expect(stepZoom(3, 1)).toBe(3);
});
