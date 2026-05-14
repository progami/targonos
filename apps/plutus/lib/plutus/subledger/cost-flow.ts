import {
  emptyComponentCosts,
  type ComponentCostsCents,
  type InventoryMovementType,
} from './types';

export type FifoCostLayerInput = {
  id: string;
  canonicalProductId: string;
  receivedDate: string;
  quantity: number;
  componentCostsCents: ComponentCostsCents;
};

export type InventoryMovementInput = {
  id: string;
  canonicalProductId: string;
  movementDate: string;
  movementType: InventoryMovementType;
  quantity: number;
};

export type MovementCostResult = {
  movementId: string;
  quantity: number;
  manufacturingCents: number;
  freightCents: number;
  dutyCents: number;
  mfgAccessoriesCents: number;
};

export type EndingLayerResult = {
  id: string;
  remainingQuantity: number;
};

export type CostFlowBlock = {
  movementId: string;
  code: 'NEGATIVE_INVENTORY' | 'INVALID_LAYER' | 'INVALID_MOVEMENT';
  message: string;
};

export type CostFlowResult = {
  movementCosts: MovementCostResult[];
  endingLayers: EndingLayerResult[];
  blocks: CostFlowBlock[];
};

type LayerState = {
  layer: FifoCostLayerInput;
  consumedQuantity: number;
  remainingQuantity: number;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareLayers(left: FifoCostLayerInput, right: FifoCostLayerInput): number {
  const dateComparison = compareText(left.receivedDate, right.receivedDate);
  if (dateComparison !== 0) return dateComparison;
  return compareText(left.id, right.id);
}

function compareMovements(left: InventoryMovementInput, right: InventoryMovementInput): number {
  const dateComparison = compareText(left.movementDate, right.movementDate);
  if (dateComparison !== 0) return dateComparison;
  return compareText(left.id, right.id);
}

function componentCostsAreFinite(componentCostsCents: ComponentCostsCents): boolean {
  return (
    Number.isFinite(componentCostsCents.manufacturing) &&
    Number.isFinite(componentCostsCents.freight) &&
    Number.isFinite(componentCostsCents.duty) &&
    Number.isFinite(componentCostsCents.mfgAccessories)
  );
}

function allocateComponentCost(
  totalCostCents: number,
  totalQuantity: number,
  consumedBefore: number,
  consumeQuantity: number,
): number {
  const costThroughEnd = Math.round((totalCostCents * (consumedBefore + consumeQuantity)) / totalQuantity);
  const costThroughStart = Math.round((totalCostCents * consumedBefore) / totalQuantity);
  return costThroughEnd - costThroughStart;
}

function movementCostResult(
  movementId: string,
  quantity: number,
  componentCostsCents: ComponentCostsCents,
): MovementCostResult {
  return {
    movementId,
    quantity,
    manufacturingCents: componentCostsCents.manufacturing,
    freightCents: componentCostsCents.freight,
    dutyCents: componentCostsCents.duty,
    mfgAccessoriesCents: componentCostsCents.mfgAccessories,
  };
}

export function consumeInventoryMovementsFifo(input: {
  layers: FifoCostLayerInput[];
  movements: InventoryMovementInput[];
}): CostFlowResult {
  const blocks: CostFlowBlock[] = [];
  const movementCosts: MovementCostResult[] = [];
  const layerStates: LayerState[] = [];

  for (const layer of input.layers) {
    if (!(Number.isFinite(layer.quantity) && layer.quantity > 0)) {
      blocks.push({
        movementId: layer.id,
        code: 'INVALID_LAYER',
        message: `Layer ${layer.id} quantity must be positive`,
      });
      continue;
    }

    if (!componentCostsAreFinite(layer.componentCostsCents)) {
      blocks.push({
        movementId: layer.id,
        code: 'INVALID_LAYER',
        message: `Layer ${layer.id} component costs must be finite`,
      });
      continue;
    }

    layerStates.push({
      layer,
      consumedQuantity: 0,
      remainingQuantity: layer.quantity,
    });
  }

  layerStates.sort((left, right) => compareLayers(left.layer, right.layer));

  const validMovements: InventoryMovementInput[] = [];
  for (const movement of input.movements) {
    if (!Number.isFinite(movement.quantity)) {
      blocks.push({
        movementId: movement.id,
        code: 'INVALID_MOVEMENT',
        message: `Movement ${movement.id} quantity must be finite`,
      });
      continue;
    }

    if (movement.quantity === 0) {
      blocks.push({
        movementId: movement.id,
        code: 'INVALID_MOVEMENT',
        message: `Movement ${movement.id} quantity cannot be zero`,
      });
      continue;
    }

    validMovements.push(movement);
  }

  validMovements.sort(compareMovements);

  for (const movement of validMovements) {
    if (movement.quantity > 0) continue;

    const absoluteQuantity = Math.abs(movement.quantity);
    const availableQuantity = layerStates.reduce((total, state) => {
      if (state.layer.canonicalProductId !== movement.canonicalProductId) return total;
      return total + state.remainingQuantity;
    }, 0);
    let quantityToConsume = Math.min(absoluteQuantity, availableQuantity);
    let consumedQuantity = 0;
    const componentCostsCents = emptyComponentCosts();

    if (availableQuantity < absoluteQuantity) {
      blocks.push({
        movementId: movement.id,
        code: 'NEGATIVE_INVENTORY',
        message: `Movement ${movement.id} needs ${absoluteQuantity} units but only ${availableQuantity} are available`,
      });
    }

    for (const state of layerStates) {
      if (quantityToConsume === 0) break;
      if (state.layer.canonicalProductId !== movement.canonicalProductId) continue;
      if (state.remainingQuantity === 0) continue;

      const consumeQuantity = Math.min(quantityToConsume, state.remainingQuantity);
      componentCostsCents.manufacturing += allocateComponentCost(
        state.layer.componentCostsCents.manufacturing,
        state.layer.quantity,
        state.consumedQuantity,
        consumeQuantity,
      );
      componentCostsCents.freight += allocateComponentCost(
        state.layer.componentCostsCents.freight,
        state.layer.quantity,
        state.consumedQuantity,
        consumeQuantity,
      );
      componentCostsCents.duty += allocateComponentCost(
        state.layer.componentCostsCents.duty,
        state.layer.quantity,
        state.consumedQuantity,
        consumeQuantity,
      );
      componentCostsCents.mfgAccessories += allocateComponentCost(
        state.layer.componentCostsCents.mfgAccessories,
        state.layer.quantity,
        state.consumedQuantity,
        consumeQuantity,
      );

      state.consumedQuantity += consumeQuantity;
      state.remainingQuantity -= consumeQuantity;
      consumedQuantity += consumeQuantity;
      quantityToConsume -= consumeQuantity;
    }

    movementCosts.push(movementCostResult(movement.id, consumedQuantity, componentCostsCents));
  }

  return {
    movementCosts,
    endingLayers: layerStates.map((state) => ({
      id: state.layer.id,
      remainingQuantity: state.remainingQuantity,
    })),
    blocks,
  };
}
