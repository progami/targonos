import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-qbo-audit' });

export async function GET() {
  try {
    const rows = await db.qboPosting.findMany({
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      take: 500,
      select: {
        id: true,
        qboTxnType: true,
        qboTxnId: true,
        qboSyncToken: true,
        qboDocNumber: true,
        qboPrivateNote: true,
        qboTxnDate: true,
        postingHash: true,
        driftStatus: true,
        attachmentStatus: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
        postingIntent: {
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            market: true,
            periodStart: true,
            periodEnd: true,
            sourceHash: true,
            mappingVersion: true,
            postingHash: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        lineFingerprints: {
          orderBy: [
            { driftStatus: 'asc' },
            { qboLineId: 'asc' },
          ],
          select: {
            id: true,
            qboLineId: true,
            expectedLineHash: true,
            liveLineHash: true,
            driftStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const postings = rows.map((row) => ({
      id: row.id,
      qboTxnType: row.qboTxnType,
      qboTxnId: row.qboTxnId,
      qboSyncToken: row.qboSyncToken,
      qboDocNumber: row.qboDocNumber,
      qboPrivateNote: row.qboPrivateNote,
      qboTxnDate: row.qboTxnDate,
      postingHash: row.postingHash,
      driftStatus: row.driftStatus,
      attachmentStatus: row.attachmentStatus,
      lastCheckedAt: row.lastCheckedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourceType: row.postingIntent.sourceType,
      sourceId: row.postingIntent.sourceId,
      market: row.postingIntent.market,
      lineCount: row.lineFingerprints.length,
      postingIntent: row.postingIntent,
      lineFingerprints: row.lineFingerprints,
    }));

    return NextResponse.json({ postings });
  } catch (error) {
    logger.error('Failed to list Plutus QBO postings', error);
    return NextResponse.json(
      { error: 'Failed to list QBO audit postings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
