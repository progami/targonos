"use client";

import * as React from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConnectionsStore } from "@/stores/connections-store";

type ManualReviewRow = {
  id: string;
  connectionId: string;
  marketplaceId: string;
  asin: string;
  source: string;
  externalReviewId: string | null;
  reviewDate: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  raw: unknown;
  importedAt: string;
  updatedAt: string;
};

type InsightRow = {
  connectionId: string;
  marketplaceId: string;
  asin: string;
  itemName: string | null;
  countryCode: string | null;
  topicsMentions: unknown;
  topicsStarRatingImpact: unknown;
  reviewTrends: unknown;
  topicsDateStart: string | null;
  topicsDateEnd: string | null;
  trendsDateStart: string | null;
  trendsDateEnd: string | null;
  lastSyncError: string | null;
  lastSyncAt: string;
  updatedAt: string;
};

type ImportResult = {
  requested: number;
  inserted: number;
  deduplicated: number;
};

function fmtDateTime(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtReviewDate(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function shortBody(text: string): string {
  if (text.length <= 120) return text;
  return `${text.slice(0, 120)}…`;
}

function toAsin(value: string): string {
  return value.trim().toUpperCase();
}

function toTopicCount(payload: unknown, key: "positiveTopics" | "negativeTopics"): number {
  if (payload === null) return 0;
  if (typeof payload !== "object") return 0;

  const topics = (payload as { topics?: unknown }).topics;
  if (topics === null || typeof topics !== "object") return 0;

  const list = (topics as { [k: string]: unknown })[key];
  if (!Array.isArray(list)) return 0;
  return list.length;
}

export function ReviewsClient() {
  const {
    connections,
    loading: connectionsLoading,
    hasHydrated: connectionsHydrated,
    activeConnectionId,
    setActiveConnectionId,
    fetch: fetchConnections,
  } = useConnectionsStore();

  React.useEffect(() => {
    if (!connectionsHydrated) return;
    fetchConnections();
  }, [connectionsHydrated, fetchConnections]);

  const connectionId = activeConnectionId ?? "";
  const activeConnection = React.useMemo(
    () => connections.find((connection) => connection.id === connectionId),
    [connections, connectionId]
  );
  const marketplaceOptions = React.useMemo(
    () => activeConnection?.marketplaceIds ?? [],
    [activeConnection]
  );

  const [importMarketplaceId, setImportMarketplaceId] = React.useState<string>("");
  const [importAsin, setImportAsin] = React.useState<string>("");
  const [importSource, setImportSource] = React.useState<string>("manual");
  const [importRawText, setImportRawText] = React.useState<string>("");
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  const [manualMarketplaceFilter, setManualMarketplaceFilter] = React.useState<string>("any");
  const [manualAsinFilter, setManualAsinFilter] = React.useState<string>("");
  const [manualRows, setManualRows] = React.useState<ManualReviewRow[]>([]);
  const [manualLoading, setManualLoading] = React.useState(false);

  const [insightsMarketplaceFilter, setInsightsMarketplaceFilter] = React.useState<string>("any");
  const [insightsAsinFilter, setInsightsAsinFilter] = React.useState<string>("");
  const [insightRows, setInsightRows] = React.useState<InsightRow[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  React.useEffect(() => {
    if (marketplaceOptions.length === 0) {
      setImportMarketplaceId("");
      return;
    }

    const hasSelectedMarketplace = marketplaceOptions.includes(importMarketplaceId);
    if (hasSelectedMarketplace) return;

    setImportMarketplaceId(marketplaceOptions[0] ?? "");
  }, [marketplaceOptions, importMarketplaceId]);

  React.useEffect(() => {
    if (!connectionId) {
      setManualRows([]);
      setInsightRows([]);
      return;
    }
    void loadManualReviews();
    void loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  async function loadManualReviews() {
    if (!connectionId) return;

    setManualLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      if (manualMarketplaceFilter !== "any") qs.set("marketplaceId", manualMarketplaceFilter);
      const manualAsin = toAsin(manualAsinFilter);
      if (manualAsin.length > 0) qs.set("asin", manualAsin);
      qs.set("limit", "200");

      const res = await fetch(hermesApiUrl(`/api/reviews/manual?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      const rows = Array.isArray(json.rows) ? (json.rows as ManualReviewRow[]) : [];
      setManualRows(rows);
    } catch (error: any) {
      toast.error("Could not load manual reviews", { description: error?.message ?? "" });
      setManualRows([]);
    } finally {
      setManualLoading(false);
    }
  }

  async function loadInsights() {
    if (!connectionId) return;

    setInsightsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      if (insightsMarketplaceFilter !== "any") qs.set("marketplaceId", insightsMarketplaceFilter);
      const insightsAsin = toAsin(insightsAsinFilter);
      if (insightsAsin.length > 0) qs.set("asin", insightsAsin);
      qs.set("limit", "200");

      const res = await fetch(hermesApiUrl(`/api/reviews/insights?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      const rows = Array.isArray(json.rows) ? (json.rows as InsightRow[]) : [];
      setInsightRows(rows);
    } catch (error: any) {
      toast.error("Could not load ASIN insights", { description: error?.message ?? "" });
      setInsightRows([]);
    } finally {
      setInsightsLoading(false);
    }
  }

  async function handleImport() {
    if (!connectionId) {
      toast.error("Select an account first");
      return;
    }

    if (!importMarketplaceId) {
      toast.error("Select a marketplace");
      return;
    }

    const asin = toAsin(importAsin);
    if (asin.length === 0) {
      toast.error("Enter an ASIN");
      return;
    }

    const rawText = importRawText.trim();
    if (rawText.length === 0) {
      toast.error("Paste reviews into the text area");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(hermesApiUrl("/api/reviews/import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId,
          marketplaceId: importMarketplaceId,
          asin,
          source: importSource.trim(),
          rawText,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      setImportResult(json.result as ImportResult);
      setImportRawText("");
      toast.success("Reviews imported");

      await Promise.all([loadManualReviews(), loadInsights()]);
    } catch (error: any) {
      toast.error("Import failed", { description: error?.message ?? "" });
    } finally {
      setImporting(false);
    }
  }

  const accountPlaceholder = connectionsLoading ? "Loading…" : "Account";

  return (
    <div className="space-y-4">
      <PageHeader
        title="ASIN Reviews"
        subtitle="Manual product-review ingest and Customer Feedback insights."
        right={
          <Select value={connectionId} onValueChange={setActiveConnectionId}>
            <SelectTrigger className="h-9 w-[260px]" disabled={connectionsLoading}>
              <SelectValue placeholder={accountPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {connections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  {connection.accountName} • {connection.region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Paste Reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Marketplace</Label>
                  <Select value={importMarketplaceId} onValueChange={setImportMarketplaceId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Marketplace" />
                    </SelectTrigger>
                    <SelectContent>
                      {marketplaceOptions.map((marketplaceId) => (
                        <SelectItem key={marketplaceId} value={marketplaceId}>
                          {marketplaceId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>ASIN</Label>
                  <Input
                    value={importAsin}
                    onChange={(e) => setImportAsin(e.target.value)}
                    placeholder="B0XXXXXXXX"
                    className="h-9 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Input value={importSource} onChange={(e) => setImportSource(e.target.value)} className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <Label>Action</Label>
                  <Button className="h-9 w-full" onClick={handleImport} disabled={importing || !connectionId}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="ml-1.5">Import Reviews</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Review Text</Label>
                <Textarea
                  value={importRawText}
                  onChange={(e) => setImportRawText(e.target.value)}
                  placeholder={"Paste reviews here. Separate reviews with --- or triple blank lines.\nOptional rating prefix: 4.0/5 Great quality"}
                  className="min-h-[220px] text-sm"
                />
              </div>

              {importResult ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">Requested: {importResult.requested}</Badge>
                  <Badge variant="secondary">Inserted: {importResult.inserted}</Badge>
                  <Badge variant="outline">Deduplicated: {importResult.deduplicated}</Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Imported Manual Reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
                <Select value={manualMarketplaceFilter} onValueChange={setManualMarketplaceFilter}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All marketplaces</SelectItem>
                    {marketplaceOptions.map((marketplaceId) => (
                      <SelectItem key={marketplaceId} value={marketplaceId}>
                        {marketplaceId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={manualAsinFilter}
                  onChange={(e) => setManualAsinFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    void loadManualReviews();
                  }}
                  placeholder="Filter ASIN"
                  className="h-9 w-[220px] font-mono"
                />

                <Button size="sm" variant="outline" onClick={loadManualReviews} disabled={manualLoading || !connectionId}>
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>

              <div className="max-h-[55vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Imported</TableHead>
                      <TableHead>ASIN</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Review Date</TableHead>
                      <TableHead>Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(row.importedAt)}</TableCell>
                        <TableCell className="font-mono">{row.asin}</TableCell>
                        <TableCell className="font-mono">{row.marketplaceId}</TableCell>
                        <TableCell>{row.rating === null ? "—" : row.rating.toFixed(1)}</TableCell>
                        <TableCell>{fmtReviewDate(row.reviewDate)}</TableCell>
                        <TableCell className="max-w-[520px] truncate text-muted-foreground">{shortBody(row.body)}</TableCell>
                      </TableRow>
                    ))}
                    {manualRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                          {manualLoading ? "Loading…" : "No manual reviews"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">ASIN Review Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
                <Select value={insightsMarketplaceFilter} onValueChange={setInsightsMarketplaceFilter}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All marketplaces</SelectItem>
                    {marketplaceOptions.map((marketplaceId) => (
                      <SelectItem key={marketplaceId} value={marketplaceId}>
                        {marketplaceId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={insightsAsinFilter}
                  onChange={(e) => setInsightsAsinFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    void loadInsights();
                  }}
                  placeholder="Filter ASIN"
                  className="h-9 w-[220px] font-mono"
                />

                <Button size="sm" variant="outline" onClick={loadInsights} disabled={insightsLoading || !connectionId}>
                  {insightsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>

              <div className="max-h-[55vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>ASIN</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Topics</TableHead>
                      <TableHead>Trends Window</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insightRows.map((row) => {
                      const positiveCount = toTopicCount(row.topicsMentions, "positiveTopics");
                      const negativeCount = toTopicCount(row.topicsMentions, "negativeTopics");
                      return (
                        <TableRow key={`${row.marketplaceId}-${row.asin}`}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(row.lastSyncAt)}</TableCell>
                          <TableCell className="font-mono">{row.asin}</TableCell>
                          <TableCell className="max-w-[320px] truncate">{row.itemName ?? "—"}</TableCell>
                          <TableCell>
                            <span className="font-medium">+{positiveCount}</span>
                            <span className="mx-1 text-muted-foreground">/</span>
                            <span className="font-medium">-{negativeCount}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {fmtReviewDate(row.trendsDateStart)} → {fmtReviewDate(row.trendsDateEnd)}
                          </TableCell>
                          <TableCell>
                            {row.lastSyncError === null ? (
                              <Badge variant="secondary">ok</Badge>
                            ) : (
                              <Badge variant="destructive" title={row.lastSyncError}>
                                error
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {insightRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                          {insightsLoading ? "Loading…" : "No ASIN insights"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
