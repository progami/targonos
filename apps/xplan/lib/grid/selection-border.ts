export type NormalizedCellRange = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type CellCoords = { row: number; col: number };

type SelectionBorderOptions = {
  color?: string;
  width?: number;
  existingBoxShadow?: string | null;
};

const DEFAULT_SELECTION_BORDER_COLOR = 'rgb(6 182 212)';
const DEFAULT_SELECTION_BORDER_WIDTH = 2;

export function getSelectionBorderBoxShadow(
  range: NormalizedCellRange | null,
  coords: CellCoords,
  options: SelectionBorderOptions = {},
): string | undefined {
  const { existingBoxShadow } = options;
  if (!range) return existingBoxShadow || undefined;

  const { row, col } = coords;
  const isInside =
    row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
  if (!isInside) return existingBoxShadow || undefined;

  const width = options.width ?? DEFAULT_SELECTION_BORDER_WIDTH;
  const color = options.color ?? DEFAULT_SELECTION_BORDER_COLOR;
  const shadows: string[] = [];

  if (row === range.top) shadows.push(`inset 0 ${width}px 0 0 ${color}`);
  if (row === range.bottom) shadows.push(`inset 0 -${width}px 0 0 ${color}`);
  if (col === range.left) shadows.push(`inset ${width}px 0 0 0 ${color}`);
  if (col === range.right) shadows.push(`inset -${width}px 0 0 0 ${color}`);

  if (existingBoxShadow) shadows.push(existingBoxShadow);

  return shadows.length > 0 ? shadows.join(', ') : existingBoxShadow || undefined;
}
