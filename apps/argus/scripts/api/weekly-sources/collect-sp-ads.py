#!/usr/bin/env python3

import csv
import gzip
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[5]
ENV_PATH = REPO_ROOT / '.env.local'

DEST_ROOT = Path('/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Ad Console/SP - Sponsored Products (API)')
MANIFEST_ROOT = DEST_ROOT

POLL_INTERVAL_SEC = 15
MAX_WAIT_SECONDS = 40 * 60

SUBDIR = {
    'search_term': 'SP - Search Term Report (API)',
    'advertised': 'SP - Advertised Product Report (API)',
    'campaign': 'SP - Campaign Report (API)',
    'targeting': 'SP - Targeting Report (API)',
    'placement': 'SP - Placement Report (API)',
    'purchased': 'SP - Purchased Product Report (API)',
}

CODE_SUFFIX = {
    'search_term': 'SP-SearchTerm',
    'advertised': 'SP-Advertised',
    'campaign': 'SP-Campaign',
    'targeting': 'SP-Targeting',
    'placement': 'SP-Placement',
    'purchased': 'SP-Purchased',
}


def load_env(path: Path):
    env = {}
    for raw_line in path.read_text().splitlines():
        for line in re.split(r'\\\\n|\\n', raw_line):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue

            line = re.sub(r'^\\d+→', '', line)
            key, value = line.split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            if value.endswith('$'):
                value = value[:-1]
            env[key.strip()] = value
    return env


def latest_complete_week():
    base_start = date(2025, 12, 28)  # W01 Sunday
    today = date.today()
    weekday = today.weekday()  # Monday=0 ... Sunday=6
    days_back = 7 if weekday == 5 else (weekday - 5) % 7  # previous completed Saturday
    week_end = today - timedelta(days=days_back)
    week_start = week_end - timedelta(days=6)
    week_number = ((week_start - base_start).days // 7) + 1
    return {
        'code': f'W{week_number:02d}',
        'startDate': week_start.isoformat(),
        'endDate': week_end.isoformat(),
    }


def http_json(url, method='GET', headers=None, payload=None, timeout=90):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode('utf-8', errors='replace')
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')
        try:
            parsed = json.loads(body) if body else {}
        except Exception:
            parsed = {'raw': body}
        return error.code, parsed


def get_access_token(env):
    payload = urllib.parse.urlencode({
        'grant_type': 'refresh_token',
        'refresh_token': env['AMAZON_ADS_REFRESH_TOKEN'],
        'client_id': env['AMAZON_ADS_CLIENT_ID'],
        'client_secret': env['AMAZON_ADS_CLIENT_SECRET'],
    }).encode('utf-8')
    request = urllib.request.Request(
        env['AMAZON_LWA_TOKEN_URL'],
        data=payload,
        method='POST',
        headers={'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        obj = json.loads(response.read().decode('utf-8'))
    token = obj.get('access_token')
    if not token:
        raise RuntimeError(f'No access_token in LWA response: {obj}')
    return token


def extract_duplicate_report_id(resp):
    detail = ''
    if isinstance(resp, dict):
        detail = str(resp.get('detail') or resp.get('details') or '')
    match = re.search(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', detail, flags=re.I)
    return match.group(1) if match else None


def parse_invalid_columns(detail_text):
    bad = []

    match = re.search(r'invalid values:\s*\(([^)]*)\)', detail_text)
    if match:
        bad.extend([value.strip() for value in match.group(1).split(',') if value.strip()])

    match = re.search(r'configuration\s+(.+?)\s+are not supported columns', detail_text)
    if match:
        section = match.group(1).strip().replace(' and ', ',')
        bad.extend([value.strip() for value in section.split(',') if value.strip()])

    match = re.search(r'configuration\s+(.+?)\s+is not (?:a )?supported column', detail_text)
    if match:
        token = match.group(1).strip()
        if token:
            bad.append(token)

    unique = []
    seen = set()
    for item in bad:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    return unique


def create_with_adaptive_columns(base_url, headers, week, key, suffix, cfg_base, initial_columns, max_attempts=10):
    endpoint = f'{base_url}/reporting/reports'
    columns = list(initial_columns)

    for attempt in range(1, max_attempts + 1):
        payload = {
            'name': f'argus-{week["code"]}-{key}-{suffix}-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-a{attempt}',
            'startDate': week['startDate'],
            'endDate': week['endDate'],
            'configuration': {**cfg_base, 'columns': columns},
        }
        status, resp = http_json(endpoint, method='POST', headers=headers, payload=payload)

        if status in (200, 201, 202) and resp.get('reportId'):
            return {
                'reportId': resp['reportId'],
                'columns': columns,
                'reused': False,
                'attempts': attempt,
            }

        if status == 425:
            duplicate_id = extract_duplicate_report_id(resp)
            if duplicate_id:
                return {
                    'reportId': duplicate_id,
                    'columns': columns,
                    'reused': True,
                    'attempts': attempt,
                }

        detail = str(resp.get('detail') or resp.get('details') or resp)
        if status == 400:
            invalid_columns = parse_invalid_columns(detail)
            if invalid_columns:
                before = len(columns)
                columns = [column for column in columns if column not in set(invalid_columns)]
                removed = before - len(columns)
                print(f'[{week["code"]}] prune {key}/{suffix} attempt={attempt} removed={removed} invalid={invalid_columns}', flush=True)
                if removed > 0 and columns:
                    continue

        raise RuntimeError(f'[{week["code"]}] create failed {key}/{suffix}: {status} {resp}')

    raise RuntimeError(f'[{week["code"]}] exceeded retries creating report for {key}/{suffix}')


def get_report_status(base_url, headers, report_id):
    endpoint = f'{base_url}/reporting/reports/{report_id}'
    status, resp = http_json(endpoint, method='GET', headers=headers)
    if status != 200:
        raise RuntimeError(f'poll failed for report {report_id}: {status} {resp}')
    return resp


def download_rows(download_url):
    request = urllib.request.Request(download_url, headers={'accept': 'application/octet-stream'})
    with urllib.request.urlopen(request, timeout=300) as response:
        raw = response.read()

    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    parsed = json.loads(raw.decode('utf-8'))

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        rows = parsed.get('rows')
        if isinstance(rows, list):
            return rows
        return [parsed]
    return []


def write_csv(path: Path, headers, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in rows:
            if isinstance(row, dict):
                writer.writerow([row.get(header, '') for header in headers])
            else:
                writer.writerow(['' for _ in headers])
    os.replace(temp, path)


def report_configs():
    return {
        'search_term': [
            ('main', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['searchTerm'],
                'reportTypeId': 'spSearchTerm',
                'timeUnit': 'DAILY',
                'format': 'GZIP_JSON',
            }, [
                'date', 'campaignName', 'adGroupName', 'keyword', 'searchTerm', 'matchType',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
        'advertised': [
            ('main', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['advertiser'],
                'reportTypeId': 'spAdvertisedProduct',
                'timeUnit': 'SUMMARY',
                'format': 'GZIP_JSON',
            }, [
                'campaignName', 'adGroupName', 'advertisedAsin', 'advertisedSku',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
        'campaign': [
            ('main', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['campaign'],
                'reportTypeId': 'spCampaigns',
                'timeUnit': 'DAILY',
                'format': 'GZIP_JSON',
            }, [
                'date', 'campaignId', 'campaignName', 'campaignStatus',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
        'targeting': [
            ('targets', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['targeting'],
                'filters': [{'field': 'keywordType', 'values': ['TARGETING_EXPRESSION', 'TARGETING_EXPRESSION_PREDEFINED']}],
                'reportTypeId': 'spTargeting',
                'timeUnit': 'SUMMARY',
                'format': 'GZIP_JSON',
            }, [
                'campaignName', 'adGroupName', 'targeting', 'keywordType', 'matchType',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
            ('keywords', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['targeting'],
                'filters': [{'field': 'keywordType', 'values': ['BROAD', 'PHRASE', 'EXACT']}],
                'reportTypeId': 'spTargeting',
                'timeUnit': 'SUMMARY',
                'format': 'GZIP_JSON',
            }, [
                'campaignName', 'adGroupName', 'targeting', 'keywordType', 'matchType',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
        'placement': [
            ('main', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['campaignPlacement'],
                'reportTypeId': 'spCampaigns',
                'timeUnit': 'DAILY',
                'format': 'GZIP_JSON',
            }, [
                'date', 'campaignName', 'campaignPlacement',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
        'purchased': [
            ('main', {
                'adProduct': 'SPONSORED_PRODUCTS',
                'groupBy': ['asin'],
                'reportTypeId': 'spPurchasedProduct',
                'timeUnit': 'DAILY',
                'format': 'GZIP_JSON',
            }, [
                'date', 'campaignName', 'advertisedAsin', 'purchasedAsin',
                'impressions', 'clicks', 'cost', 'clickThroughRate',
                'sales7d', 'purchases7d', 'unitsSoldClicks7d', 'acosClicks7d', 'roasClicks7d',
            ]),
        ],
    }


def run_week(base_url, headers, week):
    tasks = []
    configs = report_configs()

    for key, entries in configs.items():
        for suffix, cfg_base, initial_cols in entries:
            created = create_with_adaptive_columns(base_url, headers, week, key, suffix, cfg_base, initial_cols)
            print(
                f'[{week["code"]}] create {key}/{suffix} reportId={created["reportId"]} '
                f'reused={created["reused"]} attempts={created["attempts"]} finalCols={len(created["columns"])}',
                flush=True,
            )
            tasks.append({
                'key': key,
                'suffix': suffix,
                'columns': created['columns'],
                'reportId': created['reportId'],
                'reused': created['reused'],
                'attempts': created['attempts'],
                'statusObj': None,
            })

    deadline = time.time() + MAX_WAIT_SECONDS
    pending = len(tasks)
    while pending > 0:
        for task in tasks:
            if task['statusObj'] is not None:
                continue
            status = get_report_status(base_url, headers, task['reportId'])
            state = str(status.get('status') or '').upper()
            print(f'[{week["code"]}] poll {task["reportId"]} ({task["key"]}/{task["suffix"]}) -> {state}', flush=True)

            if state == 'COMPLETED':
                task['statusObj'] = status
                pending -= 1
                continue
            if state in ('FAILED', 'FAILURE', 'CANCELLED'):
                raise RuntimeError(f'[{week["code"]}] report failed: {task}')

        if pending <= 0:
            break
        if time.time() > deadline:
            raise RuntimeError(f'[{week["code"]}] timed out waiting for reports')
        time.sleep(POLL_INTERVAL_SEC)

    completed = {}
    for task in tasks:
        completed.setdefault(task['key'], []).append(task)

    outputs = {}
    for key, entries in completed.items():
        rows = []
        requested_headers = []
        seen_requested = set()

        for entry in entries:
            for column in entry['columns']:
                if column in seen_requested:
                    continue
                seen_requested.add(column)
                requested_headers.append(column)
            rows.extend(download_rows(entry['statusObj']['url']))

        extra_headers = []
        seen_headers = set(requested_headers)
        for row in rows:
            if not isinstance(row, dict):
                continue
            for header in row.keys():
                if header in seen_headers:
                    continue
                seen_headers.add(header)
                extra_headers.append(header)

        final_headers = requested_headers + extra_headers
        if not final_headers:
            final_headers = ['value']
        file_name = f"{week['code']}_{week['endDate']}_{CODE_SUFFIX[key]}.csv"
        output_path = DEST_ROOT / SUBDIR[key] / file_name
        write_csv(output_path, final_headers, rows)

        outputs[key] = {
            'rows': len(rows),
            'headers': len(final_headers),
            'file': str(output_path),
        }
        print(f'[{week["code"]}] saved {key} rows={len(rows)} file={output_path}', flush=True)

    manifest = {
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'week': week,
        'pollIntervalSec': POLL_INTERVAL_SEC,
        'maxWaitSec': MAX_WAIT_SECONDS,
        'reports': {
            key: [
                {
                    'suffix': entry['suffix'],
                    'reportId': entry['reportId'],
                    'status': entry['statusObj'].get('status'),
                    'createdAt': entry['statusObj'].get('createdAt'),
                    'updatedAt': entry['statusObj'].get('updatedAt'),
                    'reused': entry['reused'],
                    'attempts': entry['attempts'],
                    'finalColumns': entry['columns'],
                }
                for entry in entries
            ]
            for key, entries in completed.items()
        },
        'outputs': outputs,
    }

    manifest_path = MANIFEST_ROOT / f"{week['code']}_{week['endDate']}_SP-Manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f'[{week["code"]}] manifest {manifest_path}', flush=True)


def main():
    dry_run = '--dry-run' in os.sys.argv
    week = latest_complete_week()

    if dry_run:
        print(f'[SP-Ads][dry-run] week={week["code"]} {week["startDate"]}..{week["endDate"]}')
        for key, subdir in SUBDIR.items():
            suffix = CODE_SUFFIX[key]
            file_name = f'{week["code"]}_{week["endDate"]}_{suffix}.csv'
            print(f'[SP-Ads][dry-run] {DEST_ROOT / subdir / file_name}')
        return

    env = load_env(ENV_PATH)
    required = [
        'AMAZON_ADS_API_BASE_URL',
        'AMAZON_ADS_CLIENT_ID',
        'AMAZON_ADS_CLIENT_SECRET',
        'AMAZON_ADS_REFRESH_TOKEN',
        'AMAZON_ADS_PROFILE_ID',
        'AMAZON_LWA_TOKEN_URL',
    ]
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise RuntimeError(f'Missing env vars: {missing}')

    token = get_access_token(env)
    base_url = env['AMAZON_ADS_API_BASE_URL'].rstrip('/')
    headers = {
        'Authorization': f'Bearer {token}',
        'Amazon-Advertising-API-ClientId': env['AMAZON_ADS_CLIENT_ID'],
        'Amazon-Advertising-API-Scope': str(env['AMAZON_ADS_PROFILE_ID']),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    print(f'=== {week["code"]} {week["startDate"]}..{week["endDate"]} ===', flush=True)
    run_week(base_url, headers, week)


if __name__ == '__main__':
    main()
