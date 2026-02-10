'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { Search } from 'lucide-react';

export type ImageManagerItem = {
  id: string;
  label: string;
  asin: string | null;
  marketplace: string;
  activeVersionNumber: number | null;
  versionsCount: number;
  lastUploadAt: string | null;
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function ImageManagerClient(props: { items: ImageManagerItem[] }) {
  const [query, setQuery] = useState('');
  const q = normalize(query);

  const filtered = useMemo(() => {
    if (!q) return props.items;

    return props.items.filter((item) => {
      const asin = item.asin ? item.asin : '';
      const hay = normalize(`${item.label} ${asin} ${item.marketplace}`);
      return hay.includes(q);
    });
  }, [props.items, q]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">Listings</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filtered.length} shown
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ASIN, label, marketplace..."
              className="h-9 pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No matches.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <th className="px-4 py-3 font-medium">ASIN</th>
                  <th className="px-4 py-3 font-medium">Marketplace</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium">Versions</th>
                  <th className="px-4 py-3 font-medium">Last Upload</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/images/${item.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {item.asin ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{item.asin}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.marketplace === 'US' ? 'info' : 'neutral'} className="text-2xs">
                        {item.marketplace}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.activeVersionNumber !== null ? (
                        <Badge variant="success" className="text-2xs">
                          v{item.activeVersionNumber}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-2xs">
                          none
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {item.versionsCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.lastUploadAt ? formatRelativeTime(item.lastUploadAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/images/${item.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

