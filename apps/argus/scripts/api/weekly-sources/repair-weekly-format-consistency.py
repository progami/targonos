#!/usr/bin/env python3

import argparse
import csv
import json
import re
from datetime import date, timedelta
from pathlib import Path

MONITORING_BASE = Path(
    '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'
)
WEEKLY_BASE = MONITORING_BASE / 'Weekly'

SP_ADS_BASE = WEEKLY_BASE / 'Ad Console' / 'SP - Sponsored Products (API)'
BRAND_ANALYTICS_BASE = WEEKLY_BASE / 'Brand Analytics (API)'
BUSINESS_REPORTS_BASE = WEEKLY_BASE / 'Business Reports (API)' / 'Sales & Traffic (API)'

SP_ADS_SCHEMAS = {
    'SP - Search Term Report (API)': [
        'date',
        'campaignName',
        'adGroupName',
        'keyword',
        'searchTerm',
        'matchType',
        'impressions',
        'clicks',
        'cost',
        'clickThroughRate',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
        'acosClicks7d',
        'roasClicks7d',
    ],
    'SP - Advertised Product Report (API)': [
        'campaignName',
        'adGroupName',
        'advertisedAsin',
        'advertisedSku',
        'impressions',
        'clicks',
        'cost',
        'clickThroughRate',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
        'acosClicks7d',
        'roasClicks7d',
    ],
    'SP - Campaign Report (API)': [
        'date',
        'campaignId',
        'campaignName',
        'campaignStatus',
        'impressions',
        'clicks',
        'cost',
        'clickThroughRate',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
    ],
    'SP - Targeting Report (API)': [
        'campaignName',
        'adGroupName',
        'targeting',
        'keywordType',
        'matchType',
        'impressions',
        'clicks',
        'cost',
        'clickThroughRate',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
        'acosClicks7d',
        'roasClicks7d',
    ],
    'SP - Placement Report (API)': [
        'date',
        'campaignName',
        'impressions',
        'clicks',
        'cost',
        'clickThroughRate',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
    ],
    'SP - Purchased Product Report (API)': [
        'date',
        'campaignName',
        'advertisedAsin',
        'purchasedAsin',
        'sales7d',
        'purchases7d',
        'unitsSoldClicks7d',
    ],
}

SP_ADS_REPORT_HEADERS = {
    'search_term': SP_ADS_SCHEMAS['SP - Search Term Report (API)'],
    'advertised': SP_ADS_SCHEMAS['SP - Advertised Product Report (API)'],
    'campaign': SP_ADS_SCHEMAS['SP - Campaign Report (API)'],
    'targeting': SP_ADS_SCHEMAS['SP - Targeting Report (API)'],
    'placement': SP_ADS_SCHEMAS['SP - Placement Report (API)'],
    'purchased': SP_ADS_SCHEMAS['SP - Purchased Product Report (API)'],
}

SCP_HEADERS = [
    'startDate',
    'endDate',
    'asin',
    'impressionData.impressionCount',
    'impressionData.impressionMedianPrice.amount',
    'impressionData.impressionMedianPrice.currencyCode',
    'impressionData.sameDayShippingImpressionCount',
    'impressionData.oneDayShippingImpressionCount',
    'impressionData.twoDayShippingImpressionCount',
    'clickData.clickCount',
    'clickData.clickRate',
    'clickData.clickedMedianPrice.amount',
    'clickData.clickedMedianPrice.currencyCode',
    'clickData.sameDayShippingClickCount',
    'clickData.oneDayShippingClickCount',
    'clickData.twoDayShippingClickCount',
    'cartAddData.cartAddCount',
    'cartAddData.cartAddedMedianPrice.amount',
    'cartAddData.cartAddedMedianPrice.currencyCode',
    'cartAddData.sameDayShippingCartAddCount',
    'cartAddData.oneDayShippingCartAddCount',
    'cartAddData.twoDayShippingCartAddCount',
    'purchaseData.purchaseCount',
    'purchaseData.searchTrafficSales.amount',
    'purchaseData.searchTrafficSales.currencyCode',
    'purchaseData.conversionRate',
    'purchaseData.purchaseMedianPrice.amount',
    'purchaseData.purchaseMedianPrice.currencyCode',
    'purchaseData.sameDayShippingPurchaseCount',
    'purchaseData.oneDayShippingPurchaseCount',
    'purchaseData.twoDayShippingPurchaseCount',
]

SQP_HEADERS = [
    'startDate',
    'endDate',
    'asin',
    'searchQueryData.searchQuery',
    'searchQueryData.searchQueryScore',
    'searchQueryData.searchQueryVolume',
    'impressionData.totalQueryImpressionCount',
    'impressionData.asinImpressionCount',
    'impressionData.asinImpressionShare',
    'clickData.totalClickCount',
    'clickData.totalClickRate',
    'clickData.asinClickCount',
    'clickData.asinClickShare',
    'clickData.totalMedianClickPrice.amount',
    'clickData.totalMedianClickPrice.currencyCode',
    'clickData.asinMedianClickPrice.amount',
    'clickData.asinMedianClickPrice.currencyCode',
    'clickData.totalSameDayShippingClickCount',
    'clickData.totalOneDayShippingClickCount',
    'clickData.totalTwoDayShippingClickCount',
    'cartAddData.totalCartAddCount',
    'cartAddData.totalCartAddRate',
    'cartAddData.asinCartAddCount',
    'cartAddData.asinCartAddShare',
    'cartAddData.totalMedianCartAddPrice.amount',
    'cartAddData.totalMedianCartAddPrice.currencyCode',
    'cartAddData.asinMedianCartAddPrice.amount',
    'cartAddData.asinMedianCartAddPrice.currencyCode',
    'cartAddData.totalSameDayShippingCartAddCount',
    'cartAddData.totalOneDayShippingCartAddCount',
    'cartAddData.totalTwoDayShippingCartAddCount',
    'purchaseData.totalPurchaseCount',
    'purchaseData.totalPurchaseRate',
    'purchaseData.asinPurchaseCount',
    'purchaseData.asinPurchaseShare',
    'purchaseData.totalMedianPurchasePrice.amount',
    'purchaseData.totalMedianPurchasePrice.currencyCode',
    'purchaseData.asinMedianPurchasePrice.amount',
    'purchaseData.asinMedianPurchasePrice.currencyCode',
    'purchaseData.totalSameDayShippingPurchaseCount',
    'purchaseData.totalOneDayShippingPurchaseCount',
    'purchaseData.totalTwoDayShippingPurchaseCount',
]

TST_HEADERS = [
    'departmentName',
    'searchTerm',
    'searchFrequencyRank',
    'clickedAsin',
    'clickedItemName',
    'clickShareRank',
    'clickShare',
    'conversionShare',
]

SALES_BY_DATE_HEADERS = [
    'date',
    'salesByDate.orderedProductSales.amount',
    'salesByDate.orderedProductSales.currencyCode',
    'salesByDate.orderedProductSalesB2B.amount',
    'salesByDate.orderedProductSalesB2B.currencyCode',
    'salesByDate.unitsOrdered',
    'salesByDate.unitsOrderedB2B',
    'salesByDate.totalOrderItems',
    'salesByDate.totalOrderItemsB2B',
    'salesByDate.averageSalesPerOrderItem.amount',
    'salesByDate.averageSalesPerOrderItem.currencyCode',
    'salesByDate.averageSalesPerOrderItemB2B.amount',
    'salesByDate.averageSalesPerOrderItemB2B.currencyCode',
    'salesByDate.averageUnitsPerOrderItem',
    'salesByDate.averageUnitsPerOrderItemB2B',
    'salesByDate.averageSellingPrice.amount',
    'salesByDate.averageSellingPrice.currencyCode',
    'salesByDate.averageSellingPriceB2B.amount',
    'salesByDate.averageSellingPriceB2B.currencyCode',
    'salesByDate.unitsRefunded',
    'salesByDate.refundRate',
    'salesByDate.claimsGranted',
    'salesByDate.claimsAmount.amount',
    'salesByDate.claimsAmount.currencyCode',
    'salesByDate.shippedProductSales.amount',
    'salesByDate.shippedProductSales.currencyCode',
    'salesByDate.unitsShipped',
    'salesByDate.ordersShipped',
    'trafficByDate.browserPageViews',
    'trafficByDate.browserPageViewsB2B',
    'trafficByDate.mobileAppPageViews',
    'trafficByDate.mobileAppPageViewsB2B',
    'trafficByDate.pageViews',
    'trafficByDate.pageViewsB2B',
    'trafficByDate.browserSessions',
    'trafficByDate.browserSessionsB2B',
    'trafficByDate.mobileAppSessions',
    'trafficByDate.mobileAppSessionsB2B',
    'trafficByDate.sessions',
    'trafficByDate.sessionsB2B',
    'trafficByDate.buyBoxPercentage',
    'trafficByDate.buyBoxPercentageB2B',
    'trafficByDate.orderItemSessionPercentage',
    'trafficByDate.orderItemSessionPercentageB2B',
    'trafficByDate.unitSessionPercentage',
    'trafficByDate.unitSessionPercentageB2B',
    'trafficByDate.averageOfferCount',
    'trafficByDate.averageParentItems',
    'trafficByDate.feedbackReceived',
    'trafficByDate.negativeFeedbackReceived',
    'trafficByDate.receivedNegativeFeedbackRate',
]

SALES_BY_ASIN_HEADERS = [
    'parentAsin',
    'childAsin',
    'salesByAsin.unitsOrdered',
    'salesByAsin.unitsOrderedB2B',
    'salesByAsin.orderedProductSales.amount',
    'salesByAsin.orderedProductSales.currencyCode',
    'salesByAsin.orderedProductSalesB2B.amount',
    'salesByAsin.orderedProductSalesB2B.currencyCode',
    'salesByAsin.totalOrderItems',
    'salesByAsin.totalOrderItemsB2B',
    'trafficByAsin.browserSessions',
    'trafficByAsin.browserSessionsB2B',
    'trafficByAsin.mobileAppSessions',
    'trafficByAsin.mobileAppSessionsB2B',
    'trafficByAsin.sessions',
    'trafficByAsin.sessionsB2B',
    'trafficByAsin.browserSessionPercentage',
    'trafficByAsin.browserSessionPercentageB2B',
    'trafficByAsin.mobileAppSessionPercentage',
    'trafficByAsin.mobileAppSessionPercentageB2B',
    'trafficByAsin.sessionPercentage',
    'trafficByAsin.sessionPercentageB2B',
    'trafficByAsin.browserPageViews',
    'trafficByAsin.browserPageViewsB2B',
    'trafficByAsin.mobileAppPageViews',
    'trafficByAsin.mobileAppPageViewsB2B',
    'trafficByAsin.pageViews',
    'trafficByAsin.pageViewsB2B',
    'trafficByAsin.browserPageViewsPercentage',
    'trafficByAsin.browserPageViewsPercentageB2B',
    'trafficByAsin.mobileAppPageViewsPercentage',
    'trafficByAsin.mobileAppPageViewsPercentageB2B',
    'trafficByAsin.pageViewsPercentage',
    'trafficByAsin.pageViewsPercentageB2B',
    'trafficByAsin.buyBoxPercentage',
    'trafficByAsin.buyBoxPercentageB2B',
    'trafficByAsin.unitSessionPercentage',
    'trafficByAsin.unitSessionPercentageB2B',
]

SCP_OLD_TO_NEW = {
    'ASIN': 'asin',
    'Impressions: Impressions': 'impressionData.impressionCount',
    'Impressions: Price (Median)': 'impressionData.impressionMedianPrice.amount',
    'Impressions: Same Day Shipping Speed': 'impressionData.sameDayShippingImpressionCount',
    'Impressions: 1D Shipping Speed': 'impressionData.oneDayShippingImpressionCount',
    'Impressions: 2D Shipping Speed': 'impressionData.twoDayShippingImpressionCount',
    'Clicks: Clicks': 'clickData.clickCount',
    'Clicks: Click Rate (CTR)': 'clickData.clickRate',
    'Clicks: Price (Median)': 'clickData.clickedMedianPrice.amount',
    'Clicks: Same Day Shipping Speed': 'clickData.sameDayShippingClickCount',
    'Clicks: 1D Shipping Speed': 'clickData.oneDayShippingClickCount',
    'Clicks: 2D Shipping Speed': 'clickData.twoDayShippingClickCount',
    'Cart Adds: Cart Adds': 'cartAddData.cartAddCount',
    'Cart Adds: Price (Median)': 'cartAddData.cartAddedMedianPrice.amount',
    'Cart Adds: Same Day Shipping Speed': 'cartAddData.sameDayShippingCartAddCount',
    'Cart Adds: 1D Shipping Speed': 'cartAddData.oneDayShippingCartAddCount',
    'Cart Adds: 2D Shipping Speed': 'cartAddData.twoDayShippingCartAddCount',
    'Purchases: Purchases': 'purchaseData.purchaseCount',
    'Purchases: Search Traffic Sales': 'purchaseData.searchTrafficSales.amount',
    'Purchases: Conversion Rate %': 'purchaseData.conversionRate',
    'Purchases: Price (Median)': 'purchaseData.purchaseMedianPrice.amount',
    'Purchases: Same Day Shipping Speed': 'purchaseData.sameDayShippingPurchaseCount',
    'Purchases: 1D Shipping Speed': 'purchaseData.oneDayShippingPurchaseCount',
    'Purchases: 2D Shipping Speed': 'purchaseData.twoDayShippingPurchaseCount',
}

SQP_OLD_TO_NEW = {
    'Search Query': 'searchQueryData.searchQuery',
    'Search Query Score': 'searchQueryData.searchQueryScore',
    'Search Query Volume': 'searchQueryData.searchQueryVolume',
    'Impressions: Total Count': 'impressionData.totalQueryImpressionCount',
    'Impressions: ASIN Count': 'impressionData.asinImpressionCount',
    'Impressions: ASIN Share %': 'impressionData.asinImpressionShare',
    'Clicks: Total Count': 'clickData.totalClickCount',
    'Clicks: Click Rate %': 'clickData.totalClickRate',
    'Clicks: ASIN Count': 'clickData.asinClickCount',
    'Clicks: ASIN Share %': 'clickData.asinClickShare',
    'Clicks: Price (Median)': 'clickData.totalMedianClickPrice.amount',
    'Clicks: ASIN Price (Median)': 'clickData.asinMedianClickPrice.amount',
    'Clicks: Same Day Shipping Speed': 'clickData.totalSameDayShippingClickCount',
    'Clicks: 1D Shipping Speed': 'clickData.totalOneDayShippingClickCount',
    'Clicks: 2D Shipping Speed': 'clickData.totalTwoDayShippingClickCount',
    'Cart Adds: Total Count': 'cartAddData.totalCartAddCount',
    'Cart Adds: Cart Add Rate %': 'cartAddData.totalCartAddRate',
    'Cart Adds: ASIN Count': 'cartAddData.asinCartAddCount',
    'Cart Adds: ASIN Share %': 'cartAddData.asinCartAddShare',
    'Cart Adds: Price (Median)': 'cartAddData.totalMedianCartAddPrice.amount',
    'Cart Adds: ASIN Price (Median)': 'cartAddData.asinMedianCartAddPrice.amount',
    'Cart Adds: Same Day Shipping Speed': 'cartAddData.totalSameDayShippingCartAddCount',
    'Cart Adds: 1D Shipping Speed': 'cartAddData.totalOneDayShippingCartAddCount',
    'Cart Adds: 2D Shipping Speed': 'cartAddData.totalTwoDayShippingCartAddCount',
    'Purchases: Total Count': 'purchaseData.totalPurchaseCount',
    'Purchases: Purchase Rate %': 'purchaseData.totalPurchaseRate',
    'Purchases: ASIN Count': 'purchaseData.asinPurchaseCount',
    'Purchases: ASIN Share %': 'purchaseData.asinPurchaseShare',
    'Purchases: Price (Median)': 'purchaseData.totalMedianPurchasePrice.amount',
    'Purchases: ASIN Price (Median)': 'purchaseData.asinMedianPurchasePrice.amount',
    'Purchases: Same Day Shipping Speed': 'purchaseData.totalSameDayShippingPurchaseCount',
    'Purchases: 1D Shipping Speed': 'purchaseData.totalOneDayShippingPurchaseCount',
    'Purchases: 2D Shipping Speed': 'purchaseData.totalTwoDayShippingPurchaseCount',
}

TST_OLD_TO_NEW = {
    'Department Name': 'departmentName',
    'Search Term': 'searchTerm',
    'Search Frequency Rank': 'searchFrequencyRank',
    'Clicked ASIN': 'clickedAsin',
    'Clicked Item Name': 'clickedItemName',
    'Click Share Rank': 'clickShareRank',
    'Click Share': 'clickShare',
    'Conversion Share': 'conversionShare',
}

WEEK_FILE_RE = re.compile(r'^(W\d{2})_(\d{4}-\d{2}-\d{2})_')
SQP_ASIN_RE = re.compile(r'ASIN or Product=\["([^"]+)"\]')


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    return parser.parse_args()


def week_bounds_from_name(path: Path):
    match = WEEK_FILE_RE.match(path.name)
    if not match:
        raise RuntimeError(f'Invalid week file name: {path.name}')
    end_date = date.fromisoformat(match.group(2))
    start_date = end_date - timedelta(days=6)
    return start_date.isoformat(), end_date.isoformat()


def read_csv_rows(path: Path):
    with path.open('r', encoding='utf-8-sig', newline='') as handle:
        return [row for row in csv.reader(handle) if any(cell.strip() for cell in row)]


def write_csv_rows(path: Path, headers, rows, dry_run):
    if dry_run:
        print(f'[dry-run] rewrite {path}')
        return

    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row.get(header, '') for header in headers])


def dict_rows_from_csv(rows, header_index, rename=None):
    headers = rows[header_index]
    rename = rename or {}
    mapped_headers = [rename.get(header, header) for header in headers]
    out = []
    for raw in rows[header_index + 1:]:
        item = {}
        for index, value in enumerate(raw):
            if index >= len(mapped_headers):
                continue
            item[mapped_headers[index]] = value
        out.append(item)
    return out


def normalize_currency(row, amount_key, currency_key):
    if row.get(amount_key) and not row.get(currency_key):
        row[currency_key] = 'USD'


def rewrite_projected_csv(path: Path, headers, dry_run):
    rows = read_csv_rows(path)
    if not rows:
        return

    data = dict_rows_from_csv(rows, 0)
    write_csv_rows(path, headers, data, dry_run)


def rewrite_sp_ads_manifest(path: Path, dry_run):
    manifest = json.loads(path.read_text())

    for report_key, headers in SP_ADS_REPORT_HEADERS.items():
        reports = manifest.get('reports', {}).get(report_key, [])
        for report in reports:
            report['outputColumns'] = headers
            report['finalColumns'] = headers
        output = manifest.get('outputs', {}).get(report_key)
        if output is not None:
            output['headers'] = len(headers)

    updated = json.dumps(manifest, indent=2) + '\n'
    if dry_run:
        print(f'[dry-run] rewrite {path}')
        return
    path.write_text(updated)


def rewrite_sales_traffic(path: Path, headers, rename_prefixes, dry_run):
    rows = read_csv_rows(path)
    if not rows:
        return

    header_index = 1 if rows[0][0].startswith('reportType=') else 0
    rename = {}
    for header in rows[header_index]:
        mapped = header
        for old_prefix, new_prefix in rename_prefixes:
            if header.startswith(old_prefix):
                mapped = f'{new_prefix}{header[len(old_prefix):]}'
                break
        rename[header] = mapped

    data = dict_rows_from_csv(rows, header_index, rename)
    write_csv_rows(path, headers, data, dry_run)


def rewrite_tst(path: Path, dry_run):
    rows = read_csv_rows(path)
    if not rows:
        return

    data = dict_rows_from_csv(rows, 0, TST_OLD_TO_NEW)
    write_csv_rows(path, TST_HEADERS, data, dry_run)


def rewrite_scp(path: Path, dry_run):
    rows = read_csv_rows(path)
    if not rows:
        return

    start_date, end_date = week_bounds_from_name(path)
    header_index = 1 if rows[0][0].startswith('Reporting Range=') else 0
    data = dict_rows_from_csv(rows, header_index, SCP_OLD_TO_NEW)

    normalized = []
    for row in data:
        item = {
            'startDate': row.get('startDate', start_date),
            'endDate': row.get('endDate', end_date),
            'asin': row.get('asin', ''),
        }
        for header in SCP_HEADERS[3:]:
            item[header] = row.get(header, '')
        normalize_currency(item, 'impressionData.impressionMedianPrice.amount', 'impressionData.impressionMedianPrice.currencyCode')
        normalize_currency(item, 'clickData.clickedMedianPrice.amount', 'clickData.clickedMedianPrice.currencyCode')
        normalize_currency(item, 'cartAddData.cartAddedMedianPrice.amount', 'cartAddData.cartAddedMedianPrice.currencyCode')
        normalize_currency(item, 'purchaseData.searchTrafficSales.amount', 'purchaseData.searchTrafficSales.currencyCode')
        normalize_currency(item, 'purchaseData.purchaseMedianPrice.amount', 'purchaseData.purchaseMedianPrice.currencyCode')
        normalized.append(item)

    write_csv_rows(path, SCP_HEADERS, normalized, dry_run)


def rewrite_sqp(path: Path, dry_run):
    rows = read_csv_rows(path)
    if not rows:
        return

    start_date, end_date = week_bounds_from_name(path)
    asin = 'B09HXC3NL8'
    header_index = 0
    if rows[0][0].startswith('ASIN or Product='):
        header_index = 1
        match = SQP_ASIN_RE.search(rows[0][0])
        if match:
            asin = match.group(1)

    data = dict_rows_from_csv(rows, header_index, SQP_OLD_TO_NEW)

    normalized = []
    for row in data:
        item = {
            'startDate': row.get('startDate', start_date),
            'endDate': row.get('endDate', end_date),
            'asin': row.get('asin', asin),
        }
        for header in SQP_HEADERS[3:]:
            item[header] = row.get(header, '')
        normalize_currency(item, 'clickData.totalMedianClickPrice.amount', 'clickData.totalMedianClickPrice.currencyCode')
        normalize_currency(item, 'clickData.asinMedianClickPrice.amount', 'clickData.asinMedianClickPrice.currencyCode')
        normalize_currency(item, 'cartAddData.totalMedianCartAddPrice.amount', 'cartAddData.totalMedianCartAddPrice.currencyCode')
        normalize_currency(item, 'cartAddData.asinMedianCartAddPrice.amount', 'cartAddData.asinMedianCartAddPrice.currencyCode')
        normalize_currency(item, 'purchaseData.totalMedianPurchasePrice.amount', 'purchaseData.totalMedianPurchasePrice.currencyCode')
        normalize_currency(item, 'purchaseData.asinMedianPurchasePrice.amount', 'purchaseData.asinMedianPurchasePrice.currencyCode')
        normalized.append(item)

    write_csv_rows(path, SQP_HEADERS, normalized, dry_run)


def main():
    args = parse_args()

    for subdir, headers in SP_ADS_SCHEMAS.items():
        for path in sorted((SP_ADS_BASE / subdir).glob('W*_*.csv')):
            rewrite_projected_csv(path, headers, args.dry_run)

    for path in sorted(SP_ADS_BASE.glob('W*_SP-Manifest.json')):
        if not WEEK_FILE_RE.match(path.name):
            continue
        rewrite_sp_ads_manifest(path, args.dry_run)

    for path in sorted((BUSINESS_REPORTS_BASE).glob('W*_SalesTraffic-ByDate.csv')):
        rewrite_sales_traffic(
            path,
            SALES_BY_DATE_HEADERS,
            [('sales.', 'salesByDate.'), ('traffic.', 'trafficByDate.')],
            args.dry_run,
        )

    for path in sorted((BUSINESS_REPORTS_BASE).glob('W*_SalesTraffic-ByAsin.csv')):
        rewrite_sales_traffic(
            path,
            SALES_BY_ASIN_HEADERS,
            [('sales.', 'salesByAsin.'), ('traffic.', 'trafficByAsin.')],
            args.dry_run,
        )

    for path in sorted((BRAND_ANALYTICS_BASE / 'TST - Top Search Terms (API)').glob('W*_TST.csv')):
        rewrite_tst(path, args.dry_run)

    for path in sorted((BRAND_ANALYTICS_BASE / 'SCP - Search Catalog Performance (API)').glob('W*_SCP.csv')):
        rewrite_scp(path, args.dry_run)

    for path in sorted((BRAND_ANALYTICS_BASE / 'SQP - Search Query Performance (API)').glob('W*_SQP.csv')):
        rewrite_sqp(path, args.dry_run)


if __name__ == '__main__':
    main()
