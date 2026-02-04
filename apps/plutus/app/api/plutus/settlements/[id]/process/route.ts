import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import { QboAuthError, type QboConnection } from '@/lib/qbo/api';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { unzipSync, strFromU8 } from 'fflate';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-process' });

type RouteContext = { params: Promise<{ id: string }> };

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

async function readAuditCsvText(file: File): Promise<{ csvText: string; sourceFilename: string }> {
  const bytes = toUint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.zip')) {
    const unzipped = unzipSync(bytes);
    const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
    if (csvEntries.length !== 1) {
      throw new Error(`ZIP must contain exactly one .csv (found ${csvEntries.length})`);
    }

    const entry = csvEntries[0];
    if (!entry) {
      throw new Error('ZIP is missing CSV entry');
    }

    return { csvText: strFromU8(entry[1]), sourceFilename: file.name };
  }

  if (lowerName.endsWith('.csv')) {
    return { csvText: strFromU8(bytes), sourceFilename: file.name };
  }

  throw new Error('Unsupported file type. Upload a .zip or .csv');
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: settlementJournalEntryId } = await context.params;

    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;
    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const formData = await req.formData();
    const file = formData.get('file');
    const invoiceRaw = formData.get('invoice');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const invoiceId = typeof invoiceRaw === 'string' ? invoiceRaw.trim() : undefined;
    const { csvText, sourceFilename } = await readAuditCsvText(file);

    const processed = await processSettlement({
      connection,
      settlementJournalEntryId,
      auditCsvText: csvText,
      sourceFilename,
      invoiceId,
    });

    if (processed.updatedConnection) {
      cookieStore.set('qbo_connection', JSON.stringify(processed.updatedConnection), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(processed.updatedConnection);
    }

    if (!processed.result.ok) {
      return NextResponse.json(processed.result.preview, { status: 400 });
    }

    return NextResponse.json(processed.result, { status: 200 });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to process settlement', { error });
    return NextResponse.json(
      {
        error: 'Failed to process settlement',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
