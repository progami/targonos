export function getSettlementDisplayId(input: {
  sourceSettlementId: string;
  childDocNumbers: readonly string[];
}): string {
  const sourceSettlementId = input.sourceSettlementId.trim()
  if (!sourceSettlementId.startsWith('EG-')) {
    return sourceSettlementId
  }

  const firstChildDocNumber = input.childDocNumbers.find((docNumber) => docNumber.trim() !== '')
  if (!firstChildDocNumber) {
    return sourceSettlementId
  }

  return firstChildDocNumber
}
