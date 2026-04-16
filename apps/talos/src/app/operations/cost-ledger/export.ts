type CostLedgerExportPayload = {
  downloadUrl: string
  filename: string
}

type JsonResponseLike = Pick<Response, 'ok' | 'json'>

export async function parseCostLedgerExportResponse(
  response: JsonResponseLike
): Promise<CostLedgerExportPayload> {
  if (!response.ok) {
    throw new Error('Failed to export cost ledger')
  }

  const payload = await response.json()
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Cost ledger export response is not a JSON object')
  }

  const record = payload as Record<string, unknown>
  if (typeof record.downloadUrl !== 'string') {
    throw new Error('Cost ledger export response is missing a download URL')
  }

  if (typeof record.filename !== 'string') {
    throw new Error('Cost ledger export response is missing a filename')
  }

  return {
    downloadUrl: record.downloadUrl,
    filename: record.filename,
  }
}
