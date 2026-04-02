interface CsvRow {
  [key: string]: string
}

export function parseCsvRows(input: string): CsvRow[] {
  const rows = parseCsv(input)
  if (rows.length === 0) return []

  const [header, ...body] = rows

  return body
    .filter((row) => row.some((value) => value !== ''))
    .map((row, rowIndex) => {
      if (row.length !== header.length) {
        throw new Error(
          `CSV row ${rowIndex + 2} has ${row.length} columns; expected ${header.length}.`,
        )
      }

      const record: CsvRow = {}
      for (let i = 0; i < header.length; i += 1) {
        record[header[i]] = row[i]
      }
      return record
    })
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          currentValue += '"'
          i += 1
          continue
        }
        inQuotes = false
        continue
      }

      currentValue += char
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      currentRow.push(currentValue)
      currentValue = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    if (char === '\n') {
      currentRow.push(currentValue)
      rows.push(currentRow)
      currentRow = []
      currentValue = ''
      continue
    }

    currentValue += char
  }

  if (inQuotes) {
    throw new Error('CSV parsing failed because the file ended inside a quoted field.')
  }

  if (currentValue !== '' || currentRow.length > 0) {
    currentRow.push(currentValue)
    rows.push(currentRow)
  }

  return rows
}
