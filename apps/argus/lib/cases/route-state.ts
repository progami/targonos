import {
  isCaseReportDate,
  isCaseReportMarketSlug,
  readCaseReportBundle,
  readCaseReportMarketLabel,
  type CaseReportBundle,
  type CaseReportMarketSlug,
} from './reader-core'

type CaseReportBundleReader = (
  marketSlug: CaseReportMarketSlug,
  requestedReportDate?: string,
) => Promise<CaseReportBundle>

type CaseReportUnavailableState = {
  kind: 'unavailable'
  marketLabel: string
  marketSlug: CaseReportMarketSlug
  reportDate?: string
}

export type LatestCaseReportRouteState =
  | { kind: 'not_found' }
  | { kind: 'redirect'; marketSlug: CaseReportMarketSlug; reportDate: string }
  | CaseReportUnavailableState

export type DatedCaseReportRouteState =
  | { kind: 'not_found' }
  | { kind: 'bundle'; bundle: CaseReportBundle }
  | CaseReportUnavailableState

export async function resolveLatestCaseReportRouteState(
  market: string,
  readBundle: CaseReportBundleReader = readCaseReportBundle,
): Promise<LatestCaseReportRouteState> {
  if (isCaseReportMarketSlug(market) === false) {
    return { kind: 'not_found' }
  }

  try {
    const bundle = await readBundle(market)
    return { kind: 'redirect', marketSlug: market, reportDate: bundle.reportDate }
  } catch {
    return {
      kind: 'unavailable',
      marketLabel: readCaseReportMarketLabel(market),
      marketSlug: market,
    }
  }
}

export async function resolveDatedCaseReportRouteState(
  market: string,
  reportDate: string,
  readBundle: CaseReportBundleReader = readCaseReportBundle,
): Promise<DatedCaseReportRouteState> {
  if (isCaseReportMarketSlug(market) === false) {
    return { kind: 'not_found' }
  }
  if (isCaseReportDate(reportDate) === false) {
    return { kind: 'not_found' }
  }

  try {
    const bundle = await readBundle(market, reportDate)
    return { kind: 'bundle', bundle }
  } catch {
    return {
      kind: 'unavailable',
      marketLabel: readCaseReportMarketLabel(market),
      marketSlug: market,
      reportDate,
    }
  }
}
