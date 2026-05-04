export function getSettlementDisplayId(input: {
  sourceSettlementId: string;
  childDocNumbers: readonly string[];
}): string {
  const sourceSettlementId = input.sourceSettlementId.trim()
  const canonicalPostingDocNumber = /^(?:US|UK)-\d{6}-\d{6}-S\d+(?:-[A-Z])?$/
  if (canonicalPostingDocNumber.test(sourceSettlementId)) {
    return sourceSettlementId
  }

  const firstChildDocNumber = input.childDocNumbers.find((docNumber) => docNumber.trim() !== '')
  if (!firstChildDocNumber) {
    return sourceSettlementId
  }

  return firstChildDocNumber
}
