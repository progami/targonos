import { useCallback, useRef } from 'react'

/**
 * Represents a single cell edit operation that can be undone/redone.
 */
export interface CellEdit<TRowKey = string> {
  rowKey: TRowKey
  field: string
  oldValue: string
  newValue: string
}

/**
 * A batch of edits that should be undone/redone together (e.g., paste operation).
 */
export interface EditBatch<TRowKey = string> {
  edits: CellEdit<TRowKey>[]
  timestamp: number
}

export interface GridUndoRedoOptions<TRowKey = string> {
  /**
   * Maximum number of history entries to keep.
   * Default: 50
   */
  maxHistory?: number
  /**
   * Callback when undo/redo is performed.
   * Should apply the edits to the grid data and return the updated data.
   */
  onApplyEdits?: (edits: CellEdit<TRowKey>[]) => void
}

export interface GridUndoRedoHandle<TRowKey = string> {
  /**
   * Record edits that were just made (call after each edit operation).
   * Pass an array for batch operations like paste.
   */
  recordEdits: (edits: CellEdit<TRowKey> | CellEdit<TRowKey>[]) => void
  /**
   * Undo the last edit batch
   */
  undo: () => CellEdit<TRowKey>[] | null
  /**
   * Redo the last undone edit batch
   */
  redo: () => CellEdit<TRowKey>[] | null
  /**
   * Whether undo is available
   */
  canUndo: () => boolean
  /**
   * Whether redo is available
   */
  canRedo: () => boolean
  /**
   * Clear all history
   */
  clearHistory: () => void
  /**
   * Get the number of undo/redo steps available
   */
  getHistoryInfo: () => { undoCount: number; redoCount: number }
}

/**
 * Hook for grid-specific undo/redo functionality.
 * Tracks individual cell edits rather than full state snapshots for efficiency.
 *
 * Usage:
 * ```tsx
 * const { recordEdits, undo, redo, canUndo, canRedo } = useGridUndoRedo({
 *   onApplyEdits: (edits) => {
 *     // Apply edits to grid data and queue API updates
 *   }
 * })
 *
 * // After making an edit:
 * recordEdits({ rowKey: 'row1', field: 'quantity', oldValue: '10', newValue: '20' })
 *
 * // In keydown handler:
 * if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
 *   if (event.shiftKey) {
 *     const redoEdits = redo()
 *     if (redoEdits) applyEdits(redoEdits)
 *   } else {
 *     const undoEdits = undo()
 *     if (undoEdits) applyEdits(undoEdits)
 *   }
 * }
 * ```
 */
export function useGridUndoRedo<TRowKey = string>(
  options: GridUndoRedoOptions<TRowKey> = {}
): GridUndoRedoHandle<TRowKey> {
  const { maxHistory = 50, onApplyEdits } = options

  // Undo stack: edit batches that can be undone
  const undoStackRef = useRef<EditBatch<TRowKey>[]>([])
  // Redo stack: edit batches that were undone and can be redone
  const redoStackRef = useRef<EditBatch<TRowKey>[]>([])

  const recordEdits = useCallback((edits: CellEdit<TRowKey> | CellEdit<TRowKey>[]) => {
    const editArray = Array.isArray(edits) ? edits : [edits]
    if (editArray.length === 0) return

    // Clear redo stack when new edits are made
    redoStackRef.current = []

    // Add to undo stack
    undoStackRef.current.push({
      edits: editArray,
      timestamp: Date.now(),
    })

    // Trim undo stack if it exceeds maxHistory
    if (undoStackRef.current.length > maxHistory) {
      undoStackRef.current = undoStackRef.current.slice(-maxHistory)
    }
  }, [maxHistory])

  const undo = useCallback((): CellEdit<TRowKey>[] | null => {
    const batch = undoStackRef.current.pop()
    if (!batch) return null

    // Move to redo stack
    redoStackRef.current.push(batch)

    // Return inverse edits (swap old and new values)
    const inverseEdits = batch.edits.map((edit) => ({
      ...edit,
      oldValue: edit.newValue,
      newValue: edit.oldValue,
    }))

    onApplyEdits?.(inverseEdits)
    return inverseEdits
  }, [onApplyEdits])

  const redo = useCallback((): CellEdit<TRowKey>[] | null => {
    const batch = redoStackRef.current.pop()
    if (!batch) return null

    // Move back to undo stack
    undoStackRef.current.push(batch)

    // Return original edits
    onApplyEdits?.(batch.edits)
    return batch.edits
  }, [onApplyEdits])

  const canUndo = useCallback(() => undoStackRef.current.length > 0, [])
  const canRedo = useCallback(() => redoStackRef.current.length > 0, [])

  const clearHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
  }, [])

  const getHistoryInfo = useCallback(() => ({
    undoCount: undoStackRef.current.length,
    redoCount: redoStackRef.current.length,
  }), [])

  return {
    recordEdits,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getHistoryInfo,
  }
}
