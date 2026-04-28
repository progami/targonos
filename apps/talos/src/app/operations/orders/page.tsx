import { redirect } from 'next/navigation'

type SearchParamValue = string | string[] | undefined
type SearchParams = Record<string, SearchParamValue>
type SearchParamsInput = Promise<SearchParams | undefined>

function serializeSearchParams(searchParams: SearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value)
      continue
    }
    if (Array.isArray(value)) {
      value.forEach(entry => params.append(key, entry))
    }
  }
  return params.toString()
}

export default async function OrdersRedirectPage({
  searchParams,
}: {
  searchParams: SearchParamsInput
}) {
  const resolvedSearchParams = (await Promise.resolve(searchParams)) ?? {}
  const queryString = serializeSearchParams(resolvedSearchParams)
  const target = queryString
    ? `/operations/inbound?${queryString}`
    : '/operations/inbound'

  redirect(target)
}
