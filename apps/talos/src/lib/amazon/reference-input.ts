import {
  convertLengthToCm,
  convertWeightToKg,
  getDefaultUnitSystem,
  type UnitSystem,
} from '@/lib/measurements'
import { truncateToDecimalPlaces } from '@/lib/number-precision'
import {
  formatDimensionTripletCm,
  resolveDimensionTripletCm,
  sortDimensionTripletCm,
  type DimensionTriplet,
} from '@/lib/sku-dimensions'
import type { TenantCode } from '@/lib/tenant/constants'

export type ReferenceInputPayload = {
  inputUnitSystem: UnitSystem
  unitSide1: number | null
  unitSide2: number | null
  unitSide3: number | null
  unitWeight: number | null
}

export type ReferenceStoragePayload = {
  unitDimensionsCm: string | null
  unitSide1Cm: number | null
  unitSide2Cm: number | null
  unitSide3Cm: number | null
  unitWeightKg: number | null
}

export type NormalizedReferenceInput = {
  unitTriplet: DimensionTriplet | null
  storage: ReferenceStoragePayload
}

export function isReferenceInputUnitSystemAllowedForTenant(
  tenantCode: TenantCode,
  inputUnitSystem: UnitSystem
): boolean {
  return inputUnitSystem === getDefaultUnitSystem(tenantCode)
}

export function normalizeReferenceInputForStorage(
  input: ReferenceInputPayload
): NormalizedReferenceInput {
  const rawSide1Cm =
    input.unitSide1 === null
      ? null
      : truncateToDecimalPlaces(convertLengthToCm(input.unitSide1, input.inputUnitSystem), 2)
  const rawSide2Cm =
    input.unitSide2 === null
      ? null
      : truncateToDecimalPlaces(convertLengthToCm(input.unitSide2, input.inputUnitSystem), 2)
  const rawSide3Cm =
    input.unitSide3 === null
      ? null
      : truncateToDecimalPlaces(convertLengthToCm(input.unitSide3, input.inputUnitSystem), 2)
  const rawTriplet = resolveDimensionTripletCm({
    side1Cm: rawSide1Cm,
    side2Cm: rawSide2Cm,
    side3Cm: rawSide3Cm,
  })
  const unitTriplet = rawTriplet ? sortDimensionTripletCm(rawTriplet) : null
  const unitWeightKg =
    input.unitWeight === null
      ? null
      : truncateToDecimalPlaces(convertWeightToKg(input.unitWeight, input.inputUnitSystem), 2)

  return {
    unitTriplet,
    storage: {
      unitDimensionsCm: unitTriplet ? formatDimensionTripletCm(unitTriplet) : null,
      unitSide1Cm: unitTriplet ? unitTriplet.side1Cm : null,
      unitSide2Cm: unitTriplet ? unitTriplet.side2Cm : null,
      unitSide3Cm: unitTriplet ? unitTriplet.side3Cm : null,
      unitWeightKg,
    },
  }
}
