import { createLogger } from '@targon/logger';

import { deleteJournalEntry, type QboConnection } from '@/lib/qbo/api';
import { db } from '@/lib/db';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';

const logger = createLogger({ name: 'plutus-settlement-rollback' });

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

export type RolledBackSettlementRecord = {
  marketplace: string;
  qboSettlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: Date;
  invoiceId: string;
  processingHash: string;
  sourceFilename: string;
  processedAt: Date;
  qboCogsJournalEntryId: string;
  qboPnlReclassJournalEntryId: string;
  orderSalesCount: number;
  orderReturnsCount: number;
};

export async function rollbackProcessedSettlementByJournalEntryId(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
}): Promise<{
  updatedConnection: QboConnection;
  rollback: RolledBackSettlementRecord;
}> {
  let activeConnection = input.connection;

  const existing = await db.settlementProcessing.findUnique({
    where: { qboSettlementJournalEntryId: input.settlementJournalEntryId },
    select: {
      marketplace: true,
      qboSettlementJournalEntryId: true,
      settlementDocNumber: true,
      settlementPostedDate: true,
      invoiceId: true,
      processingHash: true,
      sourceFilename: true,
      uploadedAt: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
    },
  });

  if (!existing) {
    throw new Error(`Settlement not processed: ${input.settlementJournalEntryId}`);
  }

  if (isQboJournalEntryId(existing.qboCogsJournalEntryId)) {
    try {
      const deleted = await deleteJournalEntry(activeConnection, existing.qboCogsJournalEntryId);
      if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
    } catch (error) {
      if (!isQboNotFoundError(error)) throw error;
      logger.warn('COGS Journal Entry already missing in QBO; skipping delete during rollback', {
        journalEntryId: existing.qboCogsJournalEntryId,
        settlementJournalEntryId: input.settlementJournalEntryId,
      });
    }
  }

  if (isQboJournalEntryId(existing.qboPnlReclassJournalEntryId)) {
    try {
      const deleted = await deleteJournalEntry(
        activeConnection,
        existing.qboPnlReclassJournalEntryId,
      );
      if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
    } catch (error) {
      if (!isQboNotFoundError(error)) throw error;
      logger.warn(
        'P&L Reclass Journal Entry already missing in QBO; skipping delete during rollback',
        {
          journalEntryId: existing.qboPnlReclassJournalEntryId,
          settlementJournalEntryId: input.settlementJournalEntryId,
        },
      );
    }
  }

  await db.$transaction(async (tx) => {
    const consumptions = await tx.cogsConsumption.findMany({
      where: {
        marketplace: existing.marketplace,
        settlementId: existing.invoiceId,
      },
      select: {
        costLayerId: true,
        qtyConsumed: true,
      },
    });

    for (const consumption of consumptions) {
      await tx.costLayer.update({
        where: { id: consumption.costLayerId },
        data: { qtyRemaining: { increment: consumption.qtyConsumed } },
      });
    }

    await tx.cogsConsumption.deleteMany({
      where: {
        marketplace: existing.marketplace,
        settlementId: existing.invoiceId,
      },
    });

    await tx.settlementPosting.deleteMany({
      where: {
        marketplace: existing.marketplace,
        settlementId: existing.invoiceId,
        postingType: 'COGS',
      },
    });

    await tx.settlementRollback.create({
      data: {
        marketplace: existing.marketplace,
        qboSettlementJournalEntryId: existing.qboSettlementJournalEntryId,
        settlementDocNumber: existing.settlementDocNumber,
        settlementPostedDate: existing.settlementPostedDate,
        invoiceId: existing.invoiceId,
        processingHash: existing.processingHash,
        sourceFilename: existing.sourceFilename,
        processedAt: existing.uploadedAt,
        qboCogsJournalEntryId: existing.qboCogsJournalEntryId,
        qboPnlReclassJournalEntryId: existing.qboPnlReclassJournalEntryId,
        orderSalesCount: 0,
        orderReturnsCount: 0,
      },
    });

    await tx.settlementProcessing.delete({
      where: { qboSettlementJournalEntryId: input.settlementJournalEntryId },
    });
  });

  return {
    updatedConnection: activeConnection,
    rollback: {
      marketplace: existing.marketplace,
      qboSettlementJournalEntryId: existing.qboSettlementJournalEntryId,
      settlementDocNumber: existing.settlementDocNumber,
      settlementPostedDate: existing.settlementPostedDate,
      invoiceId: existing.invoiceId,
      processingHash: existing.processingHash,
      sourceFilename: existing.sourceFilename,
      processedAt: existing.uploadedAt,
      qboCogsJournalEntryId: existing.qboCogsJournalEntryId,
      qboPnlReclassJournalEntryId: existing.qboPnlReclassJournalEntryId,
      orderSalesCount: 0,
      orderReturnsCount: 0,
    },
  };
}
