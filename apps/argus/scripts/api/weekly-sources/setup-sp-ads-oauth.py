#!/usr/bin/env python3

import json
import os
import re
import secrets
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[5]
ARGUS_ENV_PATH = REPO_ROOT / 'apps/argus/.env.local'
ROOT_ENV_PATH = REPO_ROOT / '.env.local'

AUTHORIZE_URL = 'https://www.amazon.com/ap/oa'
DEFAULT_REDIRECT_URI = 'https://oauth.pstmn.io/v1/callback'
DEFAULT_SCOPE = 'advertising::campaign_management'


def load_env(path: Path):
    env = {}
    if not path.exists():
        return env

    for raw_line in path.read_text(errors='ignore').splitlines():
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


def upsert_env(path: Path, values: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if path.exists():
        existing = path.read_text(errors='ignore').splitlines()

    keys = set(values.keys())
    kept = []
    for line in existing:
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            kept.append(line)
            continue
        candidate = re.sub(r'^\\d+→', '', stripped)
        key = candidate.split('=', 1)[0].strip()
        if key in keys:
            continue
        kept.append(line)

    output = kept[:]
    if output and output[-1].strip():
        output.append('')
    output.append('# Amazon Ads API (SP Ads)')
    for key, value in values.items():
        output.append(f'{key}={value}')

    path.write_text('\n'.join(output).rstrip() + '\n')


def require(env: dict, key: str):
    value = (env.get(key) or '').strip()
    if not value:
        raise RuntimeError(f'Missing required env var: {key}')
    return value


def first_truthy(*values):
    for value in values:
        if value:
            return value
    return None


def open_chrome(url: str):
    subprocess.run(
        ['open', '-a', 'Google Chrome', url],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def chrome_find_callback_url(redirect_prefix: str):
    script = f"""
    set redirectPrefix to \"{redirect_prefix}\"
    try
      tell application \"Google Chrome\"
        repeat with w in windows
          repeat with t in tabs of w
            set u to URL of t
            if u starts with redirectPrefix then
              return u
            end if
          end repeat
        end repeat
      end tell
    end try
    return \"\"
    """
    result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if result.returncode != 0:
        return ''
    return (result.stdout or '').strip()


def exchange_code_for_tokens(token_url: str, client_id: str, client_secret: str, code: str, redirect_uri: str):
    payload = urllib.parse.urlencode(
        {
            'grant_type': 'authorization_code',
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
        }
    ).encode('utf-8')
    req = urllib.request.Request(
        token_url,
        data=payload,
        method='POST',
        headers={'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode('utf-8', errors='replace'))


def fetch_profiles(api_base_url: str, access_token: str, client_id: str):
    req = urllib.request.Request(
        f'{api_base_url.rstrip("/")}/v2/profiles',
        method='GET',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Amazon-Advertising-API-ClientId': client_id,
            'Accept': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode('utf-8', errors='replace'))


def choose_profile(profiles: list):
    if not profiles:
        raise RuntimeError('No Amazon Ads profiles returned for this access token.')

    us_profiles = [p for p in profiles if str(p.get('countryCode', '')).upper() == 'US']
    candidates = us_profiles or profiles

    seller = [p for p in candidates if str(p.get('accountInfo', {}).get('type', '')).lower() == 'seller']
    preferred = seller or candidates

    marketplace_us = 'ATVPDKIKX0DER'
    marketplace_match = [p for p in preferred if str(p.get('accountInfo', {}).get('marketplaceStringId', '')).upper() == marketplace_us]
    selected = (marketplace_match or preferred)[0]

    profile_id = selected.get('profileId')
    if profile_id is None:
        raise RuntimeError(f'Unexpected profile payload missing profileId: {selected}')

    return selected


def main():
    env = {}
    env.update(load_env(ROOT_ENV_PATH))
    env.update(load_env(ARGUS_ENV_PATH))

    client_id = require(env, 'AMAZON_ADS_CLIENT_ID')
    client_secret = require(env, 'AMAZON_ADS_CLIENT_SECRET')
    token_url = require(env, 'AMAZON_LWA_TOKEN_URL')
    api_base_url = require(env, 'AMAZON_ADS_API_BASE_URL')

    redirect_uri = first_truthy(env.get('AMAZON_ADS_REDIRECT_URI'), DEFAULT_REDIRECT_URI)
    scope = first_truthy(env.get('AMAZON_ADS_SCOPE'), DEFAULT_SCOPE)

    state = secrets.token_urlsafe(16)
    params = {
        'client_id': client_id,
        'scope': scope,
        'response_type': 'code',
        'redirect_uri': redirect_uri,
        'state': state,
    }
    url = f'{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}'

    print('Opening Amazon Ads authorization in Chrome…', flush=True)
    open_chrome(url)
    print('Complete the login + consent, then wait for the redirect to finish.', flush=True)

    redirect_prefix = redirect_uri.split('?', 1)[0]
    deadline = time.time() + 10 * 60
    callback_url = ''
    while time.time() < deadline:
        callback_url = chrome_find_callback_url(redirect_prefix)
        if callback_url and 'code=' in callback_url:
            break
        time.sleep(1.5)

    if not callback_url:
        raise RuntimeError(
            'Could not detect the callback URL in Chrome. '
            'If macOS blocked automation, allow Terminal/Codex to control Chrome and re-run.'
        )

    parsed = urllib.parse.urlparse(callback_url)
    qs = urllib.parse.parse_qs(parsed.query)
    code = (qs.get('code') or [''])[0].strip()
    returned_state = (qs.get('state') or [''])[0].strip()
    if not code:
        raise RuntimeError(f'Callback URL missing code param: {callback_url}')
    if returned_state and returned_state != state:
        raise RuntimeError('State mismatch. Refusing to exchange code.')

    print('Exchanging code for tokens…', flush=True)
    tokens = exchange_code_for_tokens(token_url, client_id, client_secret, code, redirect_uri)
    refresh_token = (tokens.get('refresh_token') or '').strip()
    access_token = (tokens.get('access_token') or '').strip()
    if not refresh_token:
        raise RuntimeError('No refresh_token returned. Ensure you consented and this is a first-time authorization.')
    if not access_token:
        raise RuntimeError(f'No access_token in token response: {tokens}')

    print('Fetching Amazon Ads profiles…', flush=True)
    profiles = fetch_profiles(api_base_url, access_token, client_id)
    if not isinstance(profiles, list):
        raise RuntimeError(f'Unexpected profiles response: {profiles}')
    selected = choose_profile(profiles)

    profile_id = selected['profileId']
    meta = {
        'countryCode': selected.get('countryCode'),
        'accountType': selected.get('accountInfo', {}).get('type'),
        'marketplaceStringId': selected.get('accountInfo', {}).get('marketplaceStringId'),
    }
    print(f'Selected profileId={profile_id} meta={meta}', flush=True)

    upserts = {
        'AMAZON_ADS_REFRESH_TOKEN': refresh_token,
        'AMAZON_ADS_PROFILE_ID': str(profile_id),
        'AMAZON_ADS_REDIRECT_URI': redirect_uri,
        'AMAZON_ADS_SCOPE': scope,
    }
    upsert_env(ARGUS_ENV_PATH, upserts)
    upsert_env(ROOT_ENV_PATH, upserts)

    print('Done. Wrote refresh token + profile id to:', flush=True)
    print(f'  {ARGUS_ENV_PATH}', flush=True)
    print(f'  {ROOT_ENV_PATH}', flush=True)


if __name__ == '__main__':
    main()
