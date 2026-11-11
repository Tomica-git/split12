export type Orientation = 'landscape' | 'portrait';
export interface Placement { row: number; col: number; rowSpan: number; colSpan: number }
export interface Layout { rows: number; cols: number; panes: Placement[] }

export const MAX_PANES = 12;
const BANDS: readonly (readonly number[])[] = [[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [3, 3, 3], [4, 3, 3], [4, 4, 3], [4, 4, 4]];
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

export function computeLayout(count: number, orientation: Orientation): Layout {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PANES || !['landscape', 'portrait'].includes(orientation)) {
    throw new RangeError('Invalid layout');
  }
  const bands = BANDS[count]!;
  const units = bands.reduce((a, b) => a * b / gcd(a, b), 1);
  const panes: Placement[] = [];
  bands.forEach((numberInBand, band) => {
    const span = units / numberInBand;
    for (let position = 0; position < numberInBand; position++) {
      panes.push(orientation === 'landscape'
        ? { row: band + 1, col: position * span + 1, rowSpan: 1, colSpan: span }
        : { row: position * span + 1, col: band + 1, rowSpan: span, colSpan: 1 });
    }
  });
  return orientation === 'landscape'
    ? { rows: bands.length, cols: units, panes }
    : { rows: units, cols: bands.length, panes };
}
