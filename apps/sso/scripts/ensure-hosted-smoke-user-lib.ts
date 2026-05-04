type HostedSmokeGrantExpectation = {
  appSlug: string
  departments: string[]
  tenantMemberships: string[]
}

type HostedSmokeGrantState = {
  departments: string[]
  tenantMemberships: string[]
}

function sortMembers(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function formatMembers(values: string[]): string {
  return JSON.stringify(sortMembers(values))
}

export function haveSameStringMembers(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) {
    return false
  }

  const sortedExpected = sortMembers(expected)
  const sortedActual = sortMembers(actual)

  for (let index = 0; index < sortedExpected.length; index += 1) {
    if (sortedExpected[index] !== sortedActual[index]) {
      return false
    }
  }

  return true
}

export function assertHostedSmokeGrantMatches(input: {
  grant: HostedSmokeGrantExpectation
  appGrant: HostedSmokeGrantState
}) {
  const { appGrant, grant } = input

  if (!haveSameStringMembers(grant.departments, appGrant.departments)) {
    throw new Error(
      `Hosted smoke user departments mismatch for ${grant.appSlug}: expected ${formatMembers(grant.departments)}, received ${formatMembers(appGrant.departments)}.`,
    )
  }

  if (!haveSameStringMembers(grant.tenantMemberships, appGrant.tenantMemberships)) {
    throw new Error(
      `Hosted smoke user tenant memberships mismatch for ${grant.appSlug}: expected ${formatMembers(grant.tenantMemberships)}, received ${formatMembers(appGrant.tenantMemberships)}.`,
    )
  }
}
