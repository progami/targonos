import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type ProfitDisplayMode = 'unit' | 'total' | 'percent';
export type TariffInputMode = 'rate' | 'cost';
export type StageMode = 'weeks' | 'dates';

export interface CellEdit {
  rowKey: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface EditBatch {
  edits: CellEdit[];
  timestamp: number;
}

// ============================================================================
// Store State Interface
// ============================================================================

interface OpsPlanningState {
  // ---------------------------------------------------------------------------
  // Display Modes (persisted)
  // ---------------------------------------------------------------------------
  profitDisplayMode: ProfitDisplayMode;
  tariffInputMode: TariffInputMode;
  stageMode: StageMode;

  // ---------------------------------------------------------------------------
  // Undo/Redo State
  // ---------------------------------------------------------------------------
  undoStack: EditBatch[];
  redoStack: EditBatch[];
  maxHistory: number;

  // ---------------------------------------------------------------------------
  // Modal State
  // ---------------------------------------------------------------------------
  isCreateOrderOpen: boolean;
  isImportOrderOpen: boolean;

  // ---------------------------------------------------------------------------
  // Display Mode Actions
  // ---------------------------------------------------------------------------
  setProfitMode: (mode: ProfitDisplayMode) => void;
  setTariffMode: (mode: TariffInputMode) => void;
  toggleTariffMode: () => void;
  setStageMode: (mode: StageMode) => void;
  toggleStageMode: () => void;

  // ---------------------------------------------------------------------------
  // Undo/Redo Actions
  // ---------------------------------------------------------------------------
  recordEdits: (edits: CellEdit | CellEdit[]) => void;
  undo: () => CellEdit[] | null;
  redo: () => CellEdit[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;

  // ---------------------------------------------------------------------------
  // Modal Actions
  // ---------------------------------------------------------------------------
  openCreateOrder: () => void;
  closeCreateOrder: () => void;
  openImportOrder: () => void;
  closeImportOrder: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useOpsPlanningStore = create<OpsPlanningState>()(
  devtools(
    persist(
      (set, get) => ({
        // ---------------------------------------------------------------------
        // Initial State
        // ---------------------------------------------------------------------
        profitDisplayMode: 'unit',
        tariffInputMode: 'cost',
        stageMode: 'weeks',
        undoStack: [],
        redoStack: [],
        maxHistory: 50,
        isCreateOrderOpen: false,
        isImportOrderOpen: false,

        // ---------------------------------------------------------------------
        // Display Mode Actions
        // ---------------------------------------------------------------------
        setProfitMode: (mode) => set({ profitDisplayMode: mode }, false, 'setProfitMode'),

        setTariffMode: (mode) => set({ tariffInputMode: mode }, false, 'setTariffMode'),

        toggleTariffMode: () =>
          set(
            (state) => ({
              tariffInputMode: state.tariffInputMode === 'rate' ? 'cost' : 'rate',
            }),
            false,
            'toggleTariffMode',
          ),

        setStageMode: (mode) => set({ stageMode: mode }, false, 'setStageMode'),

        toggleStageMode: () =>
          set(
            (state) => ({
              stageMode: state.stageMode === 'weeks' ? 'dates' : 'weeks',
            }),
            false,
            'toggleStageMode',
          ),

        // ---------------------------------------------------------------------
        // Undo/Redo Actions
        // ---------------------------------------------------------------------
        recordEdits: (edits) => {
          const editArray = Array.isArray(edits) ? edits : [edits];
          if (editArray.length === 0) return;

          set(
            (state) => {
              const newBatch: EditBatch = {
                edits: editArray,
                timestamp: Date.now(),
              };

              let newUndoStack = [...state.undoStack, newBatch];
              if (newUndoStack.length > state.maxHistory) {
                newUndoStack = newUndoStack.slice(-state.maxHistory);
              }

              return {
                undoStack: newUndoStack,
                redoStack: [], // Clear redo stack on new edits
              };
            },
            false,
            'recordEdits',
          );
        },

        undo: () => {
          const state = get();
          if (state.undoStack.length === 0) return null;

          const batch = state.undoStack[state.undoStack.length - 1];
          const inverseEdits = batch.edits.map((edit) => ({
            ...edit,
            oldValue: edit.newValue,
            newValue: edit.oldValue,
          }));

          set(
            (s) => ({
              undoStack: s.undoStack.slice(0, -1),
              redoStack: [...s.redoStack, batch],
            }),
            false,
            'undo',
          );

          return inverseEdits;
        },

        redo: () => {
          const state = get();
          if (state.redoStack.length === 0) return null;

          const batch = state.redoStack[state.redoStack.length - 1];

          set(
            (s) => ({
              redoStack: s.redoStack.slice(0, -1),
              undoStack: [...s.undoStack, batch],
            }),
            false,
            'redo',
          );

          return batch.edits;
        },

        canUndo: () => get().undoStack.length > 0,

        canRedo: () => get().redoStack.length > 0,

        clearHistory: () => set({ undoStack: [], redoStack: [] }, false, 'clearHistory'),

        // ---------------------------------------------------------------------
        // Modal Actions
        // ---------------------------------------------------------------------
        openCreateOrder: () => set({ isCreateOrderOpen: true }, false, 'openCreateOrder'),

        closeCreateOrder: () => set({ isCreateOrderOpen: false }, false, 'closeCreateOrder'),

        openImportOrder: () => set({ isImportOrderOpen: true }, false, 'openImportOrder'),

        closeImportOrder: () => set({ isImportOrderOpen: false }, false, 'closeImportOrder'),
      }),
      {
        name: 'xplan-ops-planning',
        // Only persist display modes, not selection or undo history
        partialize: (state) => ({
          profitDisplayMode: state.profitDisplayMode,
          tariffInputMode: state.tariffInputMode,
          stageMode: state.stageMode,
        }),
      },
    ),
    { name: 'OpsPlanningStore' },
  ),
);

// ============================================================================
// Selector Hooks (for performance optimization)
// ============================================================================

export const useProfitDisplayMode = () => useOpsPlanningStore((s) => s.profitDisplayMode);
export const useTariffInputMode = () => useOpsPlanningStore((s) => s.tariffInputMode);
export const useStageMode = () => useOpsPlanningStore((s) => s.stageMode);
export const useIsCreateOrderOpen = () => useOpsPlanningStore((s) => s.isCreateOrderOpen);
export const useIsImportOrderOpen = () => useOpsPlanningStore((s) => s.isImportOrderOpen);
