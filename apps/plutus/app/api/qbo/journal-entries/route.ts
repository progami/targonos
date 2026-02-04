import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import type { QboJournalEntry, QboConnection } from '@/lib/qbo/api';
import { createJournalEntry, fetchJournalEntries, QboAuthError } from '@/lib/qbo/api';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-journal-entries' });

function shouldUseSecureCookies(req: NextRequest): boolean {
  let isHttps = req.nextUrl.protocol === 'https:';
  if (!isHttps) {
    const forwardedProto = req.headers.get('x-forwarded-proto');
    if (forwardedProto === 'https') {
      isHttps = true;
    }
  }
  return isHttps;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const searchParams = req.nextUrl.searchParams;
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const rawDocNumberContains = searchParams.get('docNumberContains');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const docNumberContains = rawDocNumberContains === null ? undefined : rawDocNumberContains;

    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage ? rawPage : '1', 10);
    const pageSize = parseInt(rawPageSize ? rawPageSize : '50', 10);
    const startPosition = (page - 1) * pageSize + 1;

    const { journalEntries, totalCount, updatedConnection } = await fetchJournalEntries(connection, {
      startDate,
      endDate,
      docNumberContains,
      maxResults: pageSize,
      startPosition,
    });

    if (updatedConnection) {
      cookieStore.set('qbo_connection', JSON.stringify(updatedConnection), {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(updatedConnection);
    }

    const transformed = journalEntries.map((je: QboJournalEntry) => ({
      id: je.Id,
      syncToken: je.SyncToken,
      date: je.TxnDate,
      docNumber: je.DocNumber,
      memo: je.PrivateNote,
      lines: je.Line.map((line: QboJournalEntry['Line'][number]) => ({
        id: line.Id,
        amount: line.Amount,
        description: line.Description,
        postingType: line.JournalEntryLineDetail.PostingType,
        accountId: line.JournalEntryLineDetail.AccountRef.value,
        account: line.JournalEntryLineDetail.AccountRef.name,
      })),
      createdAt: je.MetaData?.CreateTime,
      updatedAt: je.MetaData?.LastUpdatedTime,
    }));

    return NextResponse.json({
      journalEntries: transformed,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to fetch journal entries', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch journal entries',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const body = (await req.json()) as {
      txnDate: string;
      docNumber?: string;
      privateNote?: string;
      lines: Array<{
        amount: number;
        postingType: 'Debit' | 'Credit';
        accountId: string;
        description?: string;
      }>;
    };

    const { journalEntry, updatedConnection } = await createJournalEntry(connection, {
      txnDate: body.txnDate,
      docNumber: body.docNumber,
      privateNote: body.privateNote,
      lines: body.lines,
    });

    if (updatedConnection) {
      cookieStore.set('qbo_connection', JSON.stringify(updatedConnection), {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(updatedConnection);
    }

    return NextResponse.json({
      journalEntry: {
        id: journalEntry.Id,
        syncToken: journalEntry.SyncToken,
        date: journalEntry.TxnDate,
        docNumber: journalEntry.DocNumber,
        memo: journalEntry.PrivateNote,
      },
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to create journal entry', error);
    return NextResponse.json(
      {
        error: 'Failed to create journal entry',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
