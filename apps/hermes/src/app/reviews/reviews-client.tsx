"use client";

import * as React from "react";
import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
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
import { useConnectionsStore } from "@/stores/connections-store";

type ManualReviewRow = {
  id: string;
  connectionId: string;
  marketplaceId: string;
  sku: string;
  asin: string;
  reviewDate: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  importedAt: string;
};

type ManualReviewInsights = {
  totalReviews: number;
  avgRating: number | null;
  fiveStarReviews: number;
  fiveStarRatePct: number | null;
  last30DaysReviews: number;
  previous30DaysReviews: number;
  changeLast30Pct: number | null;
  series: Array<{
    day: string;
    reviews: number;
    avgRating: number | null;
    fiveStarReviews: number;
  }>;
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
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtRating(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(2);
}

function toSku(value: string): string {
  return value.trim().toUpperCase();
}

function shortBody(text: string): string {
  if (text.length <= 140) return text;
  return `${text.slice(0, 140)}…`;
}

function renderDelta(delta: number | null): { label: string; variant: "secondary" | "destructive" | "outline" } {
  if (delta === null) return { label: "n/a", variant: "outline" };
  if (delta >= 0) return { label: `+${delta.toFixed(1)}%`, variant: "secondary" };
  return { label: `${delta.toFixed(1)}%`, variant: "destructive" };
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

  const [marketplaceId, setMarketplaceId] = React.useState<string>("");
  const [skuInput, setSkuInput] = React.useState<string>("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  const [reviews, setReviews] = React.useState<ManualReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = React.useState(false);
  const [insights, setInsights] = React.useState<ManualReviewInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  React.useEffect(() => {
    if (marketplaceOptions.length === 0) {
      setMarketplaceId("");
      return;
    }
    const selectedExists = marketplaceOptions.includes(marketplaceId);
    if (selectedExists) return;
    setMarketplaceId(marketplaceOptions[0] ?? "");
  }, [marketplaceId, marketplaceOptions]);

  const sku = toSku(skuInput);
  const canQuery = connectionId.length > 0 && marketplaceId.length > 0 && sku.length > 0;

  async function loadReviewsAndInsights() {
    if (!canQuery) {
      setReviews([]);
      setInsights(null);
      return;
    }

    setReviewsLoading(true);
    setInsightsLoading(true);

    try {
      const manualQs = new URLSearchParams();
      manualQs.set("connectionId", connectionId);
      manualQs.set("marketplaceId", marketplaceId);
      manualQs.set("sku", sku);
      manualQs.set("limit", "500");

      const insightsQs = new URLSearchParams();
      insightsQs.set("connectionId", connectionId);
      insightsQs.set("marketplaceId", marketplaceId);
      insightsQs.set("sku", sku);

      const [manualRes, insightsRes] = await Promise.all([
        fetch(hermesApiUrl(`/api/reviews/manual?${manualQs.toString()}`)),
        fetch(hermesApiUrl(`/api/reviews/insights?${insightsQs.toString()}`)),
      ]);

      const manualJson = await manualRes.json();
      if (!manualRes.ok || manualJson?.ok !== true) {
        throw new Error(typeof manualJson?.error === "string" ? manualJson.error : `HTTP ${manualRes.status}`);
      }

      const insightsJson = await insightsRes.json();
      if (!insightsRes.ok || insightsJson?.ok !== true) {
        throw new Error(typeof insightsJson?.error === "string" ? insightsJson.error : `HTTP ${insightsRes.status}`);
      }

      const rows = Array.isArray(manualJson.rows) ? (manualJson.rows as ManualReviewRow[]) : [];
      setReviews(rows);
      setInsights((insightsJson.insights as ManualReviewInsights) ?? null);
    } catch (error: any) {
      setReviews([]);
      setInsights(null);
      toast.error("Could not load reviews data", { description: error?.message ?? "" });
    } finally {
      setReviewsLoading(false);
      setInsightsLoading(false);
    }
  }

  React.useEffect(() => {
    void loadReviewsAndInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, marketplaceId, sku]);

  async function handleImport() {
    if (!canQuery) {
      toast.error("Select account, marketplace, and SKU first");
      return;
    }
    if (selectedFile === null) {
      toast.error("Choose a file to import");
      return;
    }

    setImporting(true);
    try {
      const form = new FormData();
      form.set("connectionId", connectionId);
      form.set("marketplaceId", marketplaceId);
      form.set("sku", sku);
      form.set("file", selectedFile);

      const res = await fetch(hermesApiUrl("/api/reviews/import"), {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      setImportResult((json.result as ImportResult) ?? null);
      setSelectedFile(null);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = "";
      }
      toast.success("Reviews file imported");
      await loadReviewsAndInsights();
    } catch (error: any) {
      toast.error("Import failed", { description: error?.message ?? "" });
    } finally {
      setImporting(false);
    }
  }

  function handleExport() {
    if (!canQuery) {
      toast.error("Select account, marketplace, and SKU first");
      return;
    }
    const qs = new URLSearchParams();
    qs.set("connectionId", connectionId);
    qs.set("marketplaceId", marketplaceId);
    qs.set("sku", sku);
    window.open(hermesApiUrl(`/api/reviews/export?${qs.toString()}`), "_blank", "noopener,noreferrer");
  }

  const accountPlaceholder = connectionsLoading ? "Loading…" : "Account";
  const delta = insights ? renderDelta(insights.changeLast30Pct) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reviews Ingest"
        subtitle="Import and track product reviews by marketplace + SKU."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={connectionId} onValueChange={setActiveConnectionId}>
              <SelectTrigger className="h-9 w-[240px]" disabled={connectionsLoading}>
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

            <Select value={marketplaceId} onValueChange={setMarketplaceId} disabled={marketplaceOptions.length === 0}>
              <SelectTrigger className="h-9 w-[210px]">
                <SelectValue placeholder="Marketplace" />
              </SelectTrigger>
              <SelectContent>
                {marketplaceOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={skuInput}
              onChange={(event) => setSkuInput(event.target.value)}
              placeholder="SKU"
              className="h-9 w-[180px] font-mono"
            />
          </div>
        }
      />

      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Import / Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Reviews File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setSelectedFile(file ?? null);
                    }}
                    className="h-9"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button className="h-9 flex-1" onClick={handleImport} disabled={importing || !canQuery}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="ml-1.5">Import</span>
                  </Button>
                  <Button className="h-9" variant="outline" onClick={handleExport} disabled={!canQuery}>
                    <Download className="h-4 w-4" />
                    <span className="ml-1.5">Export</span>
                  </Button>
                </div>
              </div>

              {selectedFile ? (
                <div className="text-xs text-muted-foreground">
                  Selected file: <span className="font-medium text-foreground">{selectedFile.name}</span>
                </div>
              ) : null}

              {importResult ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">Requested: {importResult.requested}</Badge>
                  <Badge variant="secondary">Inserted: {importResult.inserted}</Badge>
                  <Badge variant="outline">Deduplicated: {importResult.deduplicated}</Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Imported Reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="px-4 pt-3">
                <Button size="sm" variant="outline" onClick={loadReviewsAndInsights} disabled={reviewsLoading || !canQuery}>
                  {reviewsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>

              <div className="max-h-[58vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Imported</TableHead>
                      <TableHead>Review Date</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>ASIN</TableHead>
                      <TableHead>Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(row.importedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(row.reviewDate)}</TableCell>
                        <TableCell>{fmtRating(row.rating)}</TableCell>
                        <TableCell className="font-mono">{row.asin}</TableCell>
                        <TableCell className="max-w-[620px] truncate text-muted-foreground">{shortBody(row.body)}</TableCell>
                      </TableRow>
                    ))}
                    {reviews.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                          {reviewsLoading ? "Loading…" : "No reviews for this SKU"}
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
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Total Reviews</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {insightsLoading ? "…" : insights?.totalReviews ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Average Rating</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {insightsLoading ? "…" : fmtRating(insights?.avgRating ?? null)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Five-Star Rate</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-2xl font-semibold">
                <span>{insightsLoading ? "…" : insights?.fiveStarRatePct ?? "n/a"}{insights && insights.fiveStarRatePct !== null ? "%" : ""}</span>
                {delta ? <Badge variant={delta.variant}>{delta.label}</Badge> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Recent Trend (90 days)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[58vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Reviews</TableHead>
                      <TableHead>Avg Rating</TableHead>
                      <TableHead>Five-Star</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(insights?.series ?? []).map((point) => (
                      <TableRow key={point.day}>
                        <TableCell>{point.day}</TableCell>
                        <TableCell>{point.reviews}</TableCell>
                        <TableCell>{fmtRating(point.avgRating)}</TableCell>
                        <TableCell>{point.fiveStarReviews}</TableCell>
                      </TableRow>
                    ))}
                    {(insights?.series.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                          {insightsLoading ? "Loading…" : "No trend data"}
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
