export function truncateToDecimalPlaces(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  if (!Number.isInteger(decimals)) {
    throw new Error('Decimal places must be an integer')
  }
  if (decimals < 0) {
    throw new Error('Decimal places must be non-negative')
  }

  const sign = value < 0 ? '-' : ''
  const absoluteText = Math.abs(value).toString()
  const exponentIndex = absoluteText.toLowerCase().indexOf('e')
  if (exponentIndex >= 0) {
    const factor = 10 ** decimals
    const scaled = Math.trunc(Math.abs(value) * factor) / factor
    return Number(`${sign}${scaled.toFixed(decimals)}`)
  }

  const decimalIndex = absoluteText.indexOf('.')
  if (decimalIndex < 0) return Number(`${sign}${absoluteText}`)
  const integerPart = absoluteText.slice(0, decimalIndex)
  const decimalPart = absoluteText.slice(decimalIndex + 1, decimalIndex + 1 + decimals)
  if (decimals === 0) return Number(`${sign}${integerPart}`)
  return Number(`${sign}${integerPart}.${decimalPart.padEnd(decimals, '0')}`)
}

export function stripTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

export function formatTruncatedDecimal(value: number, decimals: number): string {
  return stripTrailingZeros(truncateToDecimalPlaces(value, decimals).toFixed(decimals))
}
