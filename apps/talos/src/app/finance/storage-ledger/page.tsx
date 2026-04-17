import { redirect } from 'next/navigation'

type SearchParams = Record<string, string | string[] | undefined>
type SearchParamsInput = Promise<SearchParams | undefined>

function getRedirectUrl(pathname: string, searchParams: SearchParams) {
  const urlSearchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        urlSearchParams.append(key, entry)
      }
      continue
    }
    urlSearchParams.set(key, value)
  }

  const query = urlSearchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

export default async function StorageLedgerRedirectPage({
  searchParams,
}: {
  searchParams: SearchParamsInput
}) {
  const resolvedSearchParams = (await Promise.resolve(searchParams)) ?? {}
  redirect(getRedirectUrl('/operations/storage-ledger', resolvedSearchParams))
}
