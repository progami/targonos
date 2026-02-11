import { Prisma } from '@targon/prisma-talos'
import { withAuth } from '@/lib/api/auth-wrapper'
import { ApiResponses } from '@/lib/api/responses'
import { ERD_V10_ENTITIES, ERD_V10_ENTITY_COLUMNS, type ErdV10Entity } from '@/lib/erd/v10'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

type ColumnRow = {
  table_name: string
  column_name: string
}

type EntityCompliance = {
  entity: ErdV10Entity
  compliant: boolean
  expectedColumns: number
  actualColumns: number
  missingColumns: string[]
}

export const GET = withAuth(async () => {
  const prisma = await getTenantPrisma()
  const entityValues = ERD_V10_ENTITIES.map(entity => Prisma.sql`${entity}`)

  const rows = await prisma.$queryRaw<ColumnRow[]>(Prisma.sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join(entityValues)})
  `)

  const columnsByEntity = new Map<string, Set<string>>()
  for (const row of rows) {
    const existing = columnsByEntity.get(row.table_name)
    if (existing) {
      existing.add(row.column_name)
      continue
    }
    columnsByEntity.set(row.table_name, new Set([row.column_name]))
  }

  const entities: EntityCompliance[] = ERD_V10_ENTITIES.map(entity => {
    const expected = ERD_V10_ENTITY_COLUMNS[entity]
    const actual = columnsByEntity.get(entity) ?? new Set<string>()
    const missingColumns = expected.filter(column => !actual.has(column))

    return {
      entity,
      compliant: missingColumns.length === 0,
      expectedColumns: expected.length,
      actualColumns: actual.size,
      missingColumns,
    }
  })

  const compliant = entities.every(entity => entity.compliant)

  return ApiResponses.success({
    version: 'erd-v10',
    compliant,
    checkedAt: new Date().toISOString(),
    entityCount: entities.length,
    entities,
  })
})

