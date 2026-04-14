export type ResolvedTenantSchema = {
  schema: string
  source: 'database-url' | 'override'
}

export function getSchemaFromDatabaseUrl(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).searchParams.get('schema')
  } catch {
    return null
  }
}

export function resolveTenantSchema(
  databaseUrl: string,
  schemaOverride: string | undefined | null
): ResolvedTenantSchema | null {
  const schemaFromUrl = getSchemaFromDatabaseUrl(databaseUrl)
  if (schemaFromUrl) {
    return {
      schema: schemaFromUrl,
      source: 'database-url',
    }
  }

  if (schemaOverride) {
    return {
      schema: schemaOverride,
      source: 'override',
    }
  }

  return null
}
