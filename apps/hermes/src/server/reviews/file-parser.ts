import { type ManualReviewInput, parseManualReviewText } from "./manual-ingest";

type Row = Record<string, string>;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
}

function parseDelimitedRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === "\"") {
      const next = content[index + 1];
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function rowToObject(headers: string[], values: string[]): Row {
  const out: Row = {};
  for (let index = 0; index < headers.length; index += 1) {
    const key = headers[index];
    if (!key) continue;
    out[key] = values[index] ?? "";
  }
  return out;
}

const BODY_KEYS = ["body", "review", "review_text", "text", "content", "comment"];
const TITLE_KEYS = ["title", "headline", "subject"];
const DATE_KEYS = ["review_date", "date", "created_at", "created"];
const RATING_KEYS = ["rating", "stars", "star_rating", "score"];
const ID_KEYS = ["external_review_id", "review_id", "id"];
const ASIN_KEYS = ["asin", "product_asin"];

function getField(row: Row, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanText(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function getRating(row: Row): number | undefined {
  const raw = getField(row, RATING_KEYS);
  if (raw === null) return undefined;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 0 || parsed > 5) return undefined;
  return parsed;
}

function looksLikeHeader(row: string[]): boolean {
  const normalized = row.map((value) => normalizeHeader(value));
  for (const key of BODY_KEYS) {
    if (normalized.includes(key)) return true;
  }
  for (const key of RATING_KEYS) {
    if (normalized.includes(key)) return true;
  }
  return false;
}

function parseTabular(content: string, delimiter: string): ManualReviewInput[] {
  const rows = parseDelimitedRows(content, delimiter)
    .map((row) => row.map((value) => value.trim()))
    .filter((row) => row.some((value) => value.length > 0));
  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0] ?? []);
  const headers = hasHeader
    ? (rows[0] ?? []).map((value, index) => {
        const normalized = normalizeHeader(value);
        if (normalized.length > 0) return normalized;
        return `column_${index + 1}`;
      })
    : (rows[0] ?? []).map((_, index) => `column_${index + 1}`);
  const startIndex = hasHeader ? 1 : 0;

  const out: ManualReviewInput[] = [];
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rowToObject(headers, rows[index] ?? []);

    const bodyValue = getField(row, BODY_KEYS);
    const body = bodyValue ? bodyValue : cleanText(row.column_1);
    if (body === null) continue;

    const title = getField(row, TITLE_KEYS) ?? undefined;
    const reviewDate = getField(row, DATE_KEYS) ?? undefined;
    const externalReviewId = getField(row, ID_KEYS) ?? undefined;
    const asin = getField(row, ASIN_KEYS) ?? undefined;
    const rating = getRating(row);

    out.push({
      asin,
      externalReviewId,
      reviewDate,
      rating,
      title,
      body,
      raw: row,
    });
  }

  return out;
}

function parseJson(content: string): ManualReviewInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const rows =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "reviews" in parsed
        ? (parsed as { reviews?: unknown }).reviews
        : null;
  if (!Array.isArray(rows)) return [];

  const out: ManualReviewInput[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;

    const body =
      cleanText(obj.body) ??
      cleanText(obj.review) ??
      cleanText(obj.text) ??
      cleanText(obj.comment);
    if (body === null) continue;

    const ratingValue = obj.rating ?? obj.stars ?? obj.star_rating ?? obj.score;
    const ratingParsed = typeof ratingValue === "number" ? ratingValue : Number.parseFloat(String(ratingValue ?? ""));
    const rating =
      Number.isFinite(ratingParsed) && ratingParsed >= 0 && ratingParsed <= 5
        ? ratingParsed
        : undefined;

    out.push({
      asin: cleanText(obj.asin) ?? undefined,
      externalReviewId: cleanText(obj.externalReviewId) ?? cleanText(obj.reviewId) ?? cleanText(obj.id) ?? undefined,
      reviewDate: cleanText(obj.reviewDate) ?? cleanText(obj.date) ?? cleanText(obj.createdAt) ?? undefined,
      rating,
      title: cleanText(obj.title) ?? cleanText(obj.headline) ?? undefined,
      body,
      raw: row,
    });
  }
  return out;
}

function pickDelimiter(fileName: string, content: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".tsv")) return "\t";
  if (lowerName.endsWith(".csv")) return ",";

  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  if (tabCount > commaCount) return "\t";
  return ",";
}

export function parseReviewsFile(params: { fileName: string; content: string }): ManualReviewInput[] {
  const content = params.content.replace(/^\uFEFF/, "").trim();
  if (content.length === 0) return [];

  const lowerName = params.fileName.toLowerCase();
  if (lowerName.endsWith(".json")) {
    const jsonRows = parseJson(content);
    if (jsonRows.length > 0) return jsonRows;
  }

  if (lowerName.endsWith(".txt")) {
    return parseManualReviewText(content);
  }

  const delimiter = pickDelimiter(params.fileName, content);
  const tabularRows = parseTabular(content, delimiter);
  if (tabularRows.length > 0) return tabularRows;

  const jsonRows = parseJson(content);
  if (jsonRows.length > 0) return jsonRows;

  return parseManualReviewText(content);
}
