# Zustand Implementation Plan for xplan

## Overview
Add zustand for centralized state management across xplan.

## Use Cases

### 1. Global UI State
- Sidebar open/close state
- Active sheet/tab tracking
- Modal visibility states
- Theme preferences
- Toast/notification queue

### 2. Form/Table State
- Undo/redo history (replace current useGridUndoRedo hook)
- Draft edits before save
- Selection state across tables
- Active cell/row tracking
- Clipboard contents for copy/paste

### 3. Data Caching
- Cache strategy data to reduce refetches
- Cache product list
- Cache purchase orders for quick access
- Optimistic updates before server confirms

### 4. Cross-Component Sync
- Sync active order between PO table and Batch table
- Sync selection state across related components
- Share filter/sort preferences across views

## Implementation Steps

### Phase 1: Setup
- [ ] Install zustand: `pnpm add zustand -F @targon/xplan`
- [ ] Create store directory: `apps/xplan/stores/`
- [ ] Create base store with devtools middleware

### Phase 2: UI Store
- [ ] Create `useUIStore` for global UI state
- [ ] Migrate sidebar state
- [ ] Migrate modal states
- [ ] Add active sheet tracking

### Phase 3: Ops Planning Store
- [ ] Create `useOpsPlanningStore` for ops planning page
- [ ] Store active order/batch IDs
- [ ] Store undo/redo history
- [ ] Store selection state
- [ ] Store display mode preferences (profit mode, tariff mode, stage mode)

### Phase 4: Data Store
- [ ] Create `useDataStore` for cached data
- [ ] Cache products list
- [ ] Cache strategy metadata
- [ ] Implement optimistic updates

## File Structure
```
apps/xplan/stores/
  index.ts           # Export all stores
  ui-store.ts        # Global UI state
  ops-planning-store.ts  # Ops planning page state
  data-store.ts      # Cached data
```

## Example Store Structure

```typescript
// stores/ops-planning-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface OpsPlanningState {
  // Active selection
  activeOrderId: string | null;
  activeBatchId: string | null;
  
  // Display modes
  profitDisplayMode: 'unit' | 'total' | 'percent';
  tariffInputMode: 'rate' | 'cost';
  stageMode: 'weeks' | 'dates';
  
  // Undo/redo
  undoStack: EditAction[];
  redoStack: EditAction[];
  
  // Actions
  setActiveOrder: (id: string | null) => void;
  setActiveBatch: (id: string | null) => void;
  setProfitMode: (mode: 'unit' | 'total' | 'percent') => void;
  pushUndo: (action: EditAction) => void;
  undo: () => void;
  redo: () => void;
}

export const useOpsPlanningStore = create<OpsPlanningState>()(
  devtools(
    persist(
      (set, get) => ({
        activeOrderId: null,
        activeBatchId: null,
        profitDisplayMode: 'unit',
        tariffInputMode: 'cost',
        stageMode: 'weeks',
        undoStack: [],
        redoStack: [],
        
        setActiveOrder: (id) => set({ activeOrderId: id, activeBatchId: null }),
        setActiveBatch: (id) => set({ activeBatchId: id }),
        setProfitMode: (mode) => set({ profitDisplayMode: mode }),
        // ... undo/redo logic
      }),
      { name: 'xplan-ops-planning' }
    )
  )
);
```

## Migration Strategy
1. Add zustand alongside existing useState/usePersistentState
2. Migrate one piece of state at a time
3. Test thoroughly before removing old implementation
4. Keep backward compatibility during transition

## Benefits
- Single source of truth for state
- DevTools for debugging state changes
- Persist state to localStorage automatically
- No prop drilling
- Better performance (selective subscriptions)
- Easier testing
