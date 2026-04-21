import { NextRequest, NextResponse } from 'next/server';
import { getWprChangeLog } from '@/lib/wpr/reader';
import { createWprChangeLogEntry } from '@/lib/wpr/change-log-write';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const changes = await getWprChangeLog();
    return NextResponse.json(changes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the WPR changelog.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ChangeLogRequestPayload = {
  weekLabel: unknown;
  entryDate: unknown;
  category: unknown;
  title: unknown;
  summary: unknown;
  asins: unknown;
  fieldLabels: unknown;
  highlights: unknown;
  statusLines: unknown;
};

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} is required.`);
  }

  return value;
}

function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  const items = value.map((item) => {
    if (typeof item !== 'string') {
      throw new Error(`${fieldName} must contain only strings.`);
    }

    return item;
  });
  return items;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as ChangeLogRequestPayload;
    const result = await createWprChangeLogEntry({
      weekLabel: expectString(payload.weekLabel, 'weekLabel'),
      entryDate: expectString(payload.entryDate, 'entryDate'),
      category: expectString(payload.category, 'category'),
      title: expectString(payload.title, 'title'),
      summary: expectString(payload.summary, 'summary'),
      asins: expectStringArray(payload.asins, 'asins'),
      fieldLabels: expectStringArray(payload.fieldLabels, 'fieldLabels'),
      highlights: expectStringArray(payload.highlights, 'highlights'),
      statusLines: expectStringArray(payload.statusLines, 'statusLines'),
    });

    return NextResponse.json({ ok: true, filePath: result.filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create the WPR changelog entry.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
