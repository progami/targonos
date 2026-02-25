#!/usr/bin/env python3

import argparse
import csv
import gzip
import json
from pathlib import Path


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


def iter_tst_items(stream):
    key = '"dataByDepartmentAndSearchTerm"'
    decoder = json.JSONDecoder()
    buffer = ''
    found_key = False
    in_array = False

    while True:
        chunk = stream.read(65536)
        if not chunk:
            break
        buffer += chunk

        if not in_array:
            if not found_key:
                key_index = buffer.find(key)
                if key_index == -1:
                    tail = len(key) + 32
                    if len(buffer) > tail:
                        buffer = buffer[-tail:]
                    continue
                buffer = buffer[key_index + len(key):]
                found_key = True

            array_index = buffer.find('[')
            if array_index == -1:
                if len(buffer) > 1024:
                    buffer = buffer[-1024:]
                continue
            buffer = buffer[array_index + 1:]
            in_array = True

        while True:
            stripped = buffer.lstrip()
            if not stripped:
                buffer = ''
                break
            buffer = stripped

            if buffer[0] == ',':
                buffer = buffer[1:]
                continue
            if buffer[0] == ']':
                return

            try:
                item, end_index = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                break

            yield item
            buffer = buffer[end_index:]

    if not found_key:
        raise RuntimeError('Missing dataByDepartmentAndSearchTerm in report payload')
    if not in_array:
        raise RuntimeError('Malformed report payload: missing array for dataByDepartmentAndSearchTerm')

    buffer = buffer.lstrip()
    while buffer:
        if buffer[0] == ',':
            buffer = buffer[1:].lstrip()
            continue
        if buffer[0] == ']':
            return
        item, end_index = decoder.raw_decode(buffer)
        yield item
        buffer = buffer[end_index:].lstrip()


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
        for item in iter_tst_items(stream):
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
