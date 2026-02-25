#!/usr/bin/env python3

import argparse
import csv
import gzip
import json
from pathlib import Path

import ijson


def open_maybe_gzip(path: Path):
    with path.open('rb') as f:
        signature = f.read(2)
    if signature == b'\x1f\x8b':
        return gzip.open(path, 'rt', encoding='utf-8', errors='ignore')
    return path.open('rt', encoding='utf-8', errors='ignore')


def flatten(value, prefix='', out=None):
    if out is None:
        out = {}

    if value is None:
        if prefix:
            out[prefix] = ''
        return out

    if isinstance(value, dict):
        for key, nested in value.items():
            next_key = f'{prefix}.{key}' if prefix else key
            flatten(nested, next_key, out)
        return out

    if isinstance(value, list):
        primitives = all(item is None or isinstance(item, (str, int, float, bool)) for item in value)
        if primitives:
            out[prefix] = '|'.join(str(item) for item in value if item is not None)
        else:
            out[prefix] = json.dumps(value, ensure_ascii=False)
        return out

    out[prefix] = value
    return out


def main():
    parser = argparse.ArgumentParser(description='Filter TST report by keyword and write CSV.')
    parser.add_argument('--input', required=True, help='Path to raw JSON or JSON.GZ report')
    parser.add_argument('--output', required=True, help='Path to filtered CSV output')
    parser.add_argument('--keyword', required=True, help='Case-insensitive substring filter for searchTerm')
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    keyword = args.keyword.strip().lower()

    rows = []
    headers = []
    header_set = set()

    with open_maybe_gzip(input_path) as stream:
        for item in ijson.items(stream, 'dataByDepartmentAndSearchTerm.item'):
            search_term = str(item.get('searchTerm', '')).lower()
            if keyword not in search_term:
                continue

            flat = flatten(item)
            rows.append(flat)

            for key in flat.keys():
                if key in header_set:
                    continue
                header_set.add(key)
                headers.append(key)

    if not headers:
        headers = ['searchTerm']

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, '') for key in headers})

    print(f'filtered_rows={len(rows)} keyword={args.keyword} output={output_path}')


if __name__ == '__main__':
    main()
