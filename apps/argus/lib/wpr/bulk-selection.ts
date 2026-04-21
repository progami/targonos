export type BulkSelectionAction = 'select-all' | 'clear-all'

export function getBulkSelectionAction(totalCount: number, selectedCount: number): BulkSelectionAction {
  if (totalCount > 0 && selectedCount === totalCount) {
    return 'clear-all'
  }

  return 'select-all'
}
