import { readFileSync } from 'node:fs';

import { parseAmazonUnifiedTransactionCsv } from '@/lib/amazon-payments/unified-transaction-csv';

type CsvRow = string[];

function parseCsv(content: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '"') {
      const next = content[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') {
        i++;
      }
      row.push(current);
      current = '';
      rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  row.push(current);
  rows.push(row);
  return rows;
}

function findHeaderRowIndex(rows: CsvRow[], required: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i]!.map((c) => c.trim().toLowerCase());
    const foundAll = required.every((h) => normalized.includes(h.toLowerCase()));
    if (foundAll) return i;
  }
  throw new Error(`Could not find CSV header row containing: ${required.join(', ')}`);
}

function parseMoney(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid money value: ${raw}`);
  }
  return n;
}

function normalizeLedgerAccount(account: string): string {
  const trimmed = account.trim();
  if (trimmed.startsWith('Amazon Sales - ')) return 'Amazon Sales';
  if (trimmed.startsWith('Amazon Refunds - ')) return 'Amazon Refunds';
  return trimmed;
}

function normalizeLedgerMemo(memo: string): string {
  const trimmed = memo.trim();
  const patterns = [
    'Amazon Sales - Principal',
    'Amazon Sales - Shipping',
    'Amazon Sales - Shipping Promotion',
    'Amazon Refunds - Refunded Principal',
    'Amazon Refunds - Refunded Shipping',
    'Amazon Refunds - Refunded Shipping Promotion',
  ];
  for (const p of patterns) {
    if (trimmed.startsWith(p)) return p;
  }
  return trimmed;
}

function loadSettlementIdByDocNumberFromTransactionListByDateCsv(content: string): Map<string, string> {
  const rows = parseCsv(content);
  const headerIndex = findHeaderRowIndex(rows, ['Date', 'Transaction type', 'Num', 'Memo/Description']);
  const headers = rows[headerIndex]!.map((h) => h.trim());

  const idxTxnType = headers.indexOf('Transaction type');
  const idxNum = headers.indexOf('Num');
  const idxMemo = headers.indexOf('Memo/Description');

  if (idxTxnType === -1 || idxNum === -1 || idxMemo === -1) {
    throw new Error('Transaction List by Date CSV is missing required columns');
  }

  const settlementIdByDocNumber = new Map<string, string>();
  const auditUrlPattern = /downloadAuditFile\/\d+-([0-9]+)/;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const txnType = row[idxTxnType]?.trim();
    if (txnType !== 'Journal Entry') continue;

    const docNumber = row[idxNum]?.trim();
    if (!docNumber) continue;
    if (!docNumber.startsWith('LMB-')) continue;

    const memo = row[idxMemo] ?? '';
    const match = memo.match(auditUrlPattern);
    if (!match) continue;

    const settlementId = match[1]!;
    const existing = settlementIdByDocNumber.get(docNumber);
    if (existing && existing !== settlementId) {
      throw new Error(`DocNumber ${docNumber} maps to multiple settlement ids (${existing}, ${settlementId})`);
    }
    settlementIdByDocNumber.set(docNumber, settlementId);
  }

  return settlementIdByDocNumber;
}

type LedgerDocTotals = {
  accountTotals: Map<string, number>;
  memoTotals: Map<string, number>;
};

function loadLedgerTotalsByDocNumberFromGeneralLedgerCsv(content: string): Map<string, LedgerDocTotals> {
  const rows = parseCsv(content);
  const headerIndex = findHeaderRowIndex(rows, ['Distribution account', 'Transaction type', 'Num', 'Memo/Description', 'Amount']);
  const headers = rows[headerIndex]!.map((h) => h.trim());

  const idxAccount = headers.indexOf('Distribution account');
  const idxTxnType = headers.indexOf('Transaction type');
  const idxNum = headers.indexOf('Num');
  const idxMemo = headers.indexOf('Memo/Description');
  const idxAmount = headers.indexOf('Amount');

  if (idxAccount === -1 || idxTxnType === -1 || idxNum === -1 || idxMemo === -1 || idxAmount === -1) {
    throw new Error('General Ledger CSV is missing required columns');
  }

  const totalsByDoc = new Map<string, LedgerDocTotals>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length < headers.length) continue;

    const txnType = row[idxTxnType]?.trim();
    if (txnType !== 'Journal Entry') continue;

    const docNumber = row[idxNum]?.trim();
    if (!docNumber) continue;

    const amount = parseMoney(row[idxAmount] ?? '');
    if (amount === 0) continue;

    const account = normalizeLedgerAccount(row[idxAccount] ?? '');
    const memo = normalizeLedgerMemo(row[idxMemo] ?? '');

    let docTotals = totalsByDoc.get(docNumber);
    if (!docTotals) {
      docTotals = { accountTotals: new Map(), memoTotals: new Map() };
      totalsByDoc.set(docNumber, docTotals);
    }

    const currentAccount = docTotals.accountTotals.get(account);
    docTotals.accountTotals.set(account, (currentAccount === undefined ? 0 : currentAccount) + amount);

    const memoKey = `${account}::${memo}`;
    const currentMemo = docTotals.memoTotals.get(memoKey);
    docTotals.memoTotals.set(memoKey, (currentMemo === undefined ? 0 : currentMemo) + amount);
  }

  return totalsByDoc;
}

type ExpectedTotals = {
  accountTotals: Map<string, number>;
  memoTotals: Map<string, number>;
};

function isAwdDescription(description: string): boolean {
  return /\bAWD\b/i.test(description);
}

function computeExpectedTotalsBySettlementId(csvTexts: string[]): Map<string, ExpectedTotals> {
  const bySettlement = new Map<string, {
    salesPrincipal: number;
    refundsPrincipal: number;
    salesShipping: number;
    refundsShipping: number;
    salesShippingPromo: number;
    refundsShippingPromo: number;
    salesTaxPrincipal: number;
    refundsTaxPrincipal: number;
    salesTaxShipping: number;
    commission: number;
    refundCommission: number;
    refundedCommission: number;
    subscriptionFee: number;
    microDeposit: number;
    advertising: number;
    fbaFeesNonAwd: number;
    awdFees: number;
    amazonFcFees: number;
    amazonFcAdjustments: number;
  }>();

  for (const text of csvTexts) {
    const parsed = parseAmazonUnifiedTransactionCsv(text);
    for (const row of parsed.rows) {
      const settlementId = row.settlementId.trim();
      if (settlementId === '') continue;

      let acc = bySettlement.get(settlementId);
      if (!acc) {
        acc = {
          salesPrincipal: 0,
          refundsPrincipal: 0,
          salesShipping: 0,
          refundsShipping: 0,
          salesShippingPromo: 0,
          refundsShippingPromo: 0,
          salesTaxPrincipal: 0,
          refundsTaxPrincipal: 0,
          salesTaxShipping: 0,
          commission: 0,
          refundCommission: 0,
          refundedCommission: 0,
          subscriptionFee: 0,
          microDeposit: 0,
          advertising: 0,
          fbaFeesNonAwd: 0,
          awdFees: 0,
          amazonFcFees: 0,
          amazonFcAdjustments: 0,
        };
        bySettlement.set(settlementId, acc);
      }

      const type = row.type.trim();
      if (type === 'Debt') {
        continue;
      }

      const isOrder = type === 'Order';
      const isRefund = type === 'Refund';

      if (isOrder) {
        acc.salesPrincipal += row.productSales;
        acc.salesShipping += row.shippingCredits;
        acc.salesShippingPromo += row.promotionalRebates;
        acc.salesTaxPrincipal += row.productSalesTax;
        acc.salesTaxShipping += row.shippingCreditsTax;
        acc.commission += -row.sellingFees;
      }

      if (isRefund) {
        acc.refundsPrincipal += row.productSales;
        acc.refundsShipping += row.shippingCredits;
        acc.refundsShippingPromo += row.promotionalRebates;
        acc.refundsTaxPrincipal += row.productSalesTax;
        if (row.sellingFees < 0) {
          acc.refundCommission += -row.sellingFees;
        } else if (row.sellingFees > 0) {
          acc.refundedCommission += -row.sellingFees;
        }
      }

      if (type === 'Service Fee' && row.description.trim() === 'Subscription') {
        acc.subscriptionFee += -row.total;
      }

      if (type === 'Transfer' && row.description.trim() === 'Micro Deposit') {
        acc.microDeposit += -row.total;
      }

      if (type === 'Service Fee' && row.description.trim() === 'Cost of Advertising') {
        acc.advertising += -row.otherTransactionFees;
      }

      if (row.fbaFees !== 0) {
        if (isAwdDescription(row.description)) {
          acc.awdFees += -row.fbaFees;
        } else {
          acc.fbaFeesNonAwd += -row.fbaFees;
        }
      }

      if (type === 'FBA Inventory Fee') {
        acc.amazonFcFees += -row.total;
      }

      if (type === 'Fee Adjustment') {
        acc.amazonFcAdjustments += -row.total;
      }
    }
  }

  const result = new Map<string, ExpectedTotals>();

  for (const [settlementId, acc] of bySettlement.entries()) {
    const shippingChargeback = acc.salesShipping + acc.refundsShipping + acc.salesShippingPromo + acc.refundsShippingPromo;
    const fbaPerUnit = acc.fbaFeesNonAwd - shippingChargeback;

    const accountTotals = new Map<string, number>();
    const memoTotals = new Map<string, number>();

    const amazonSalesTotal = acc.salesPrincipal + acc.salesShipping + acc.salesShippingPromo;
    const amazonRefundsTotal = acc.refundsPrincipal + acc.refundsShipping + acc.refundsShippingPromo;
    const amazonSellerFeesTotal = acc.commission + acc.refundCommission + acc.refundedCommission + acc.subscriptionFee + acc.microDeposit;
    const amazonFbaFeesTotal = acc.fbaFeesNonAwd;
    const amazonFcTotal = acc.amazonFcFees + acc.amazonFcAdjustments;

    accountTotals.set('Amazon Sales', amazonSalesTotal);
    accountTotals.set('Amazon Refunds', amazonRefundsTotal);
    accountTotals.set('Amazon Seller Fees', amazonSellerFeesTotal);
    accountTotals.set('Amazon FBA Fees', amazonFbaFeesTotal);
    accountTotals.set('Amazon Advertising Costs', acc.advertising);

    if (acc.awdFees !== 0) {
      accountTotals.set('AWD', acc.awdFees);
    }
    if (amazonFcTotal !== 0) {
      accountTotals.set('Amazon FC', amazonFcTotal);
    }

    memoTotals.set('Amazon Sales::Amazon Sales - Principal', acc.salesPrincipal);
    memoTotals.set('Amazon Sales::Amazon Sales - Shipping', acc.salesShipping);
    memoTotals.set('Amazon Sales::Amazon Sales - Shipping Promotion', acc.salesShippingPromo);

    memoTotals.set('Amazon Refunds::Amazon Refunds - Refunded Principal', acc.refundsPrincipal);
    memoTotals.set('Amazon Refunds::Amazon Refunds - Refunded Shipping', acc.refundsShipping);
    memoTotals.set('Amazon Refunds::Amazon Refunds - Refunded Shipping Promotion', acc.refundsShippingPromo);

    memoTotals.set('Amazon Seller Fees::Amazon Seller Fees - Commission', acc.commission);
    memoTotals.set('Amazon Seller Fees::Amazon Seller Fees - Refund Commission', acc.refundCommission);
    memoTotals.set('Amazon Seller Fees::Amazon Seller Fees - Refunded Commission', acc.refundedCommission);
    memoTotals.set('Amazon Seller Fees::Amazon Seller Fees - Subscription Fee', acc.subscriptionFee);
    memoTotals.set('Amazon Seller Fees::Amazon Seller Fees - Micro Deposit', acc.microDeposit);

    memoTotals.set('Amazon Advertising Costs::Amazon Advertising Costs - Cost of Advertising', acc.advertising);

    memoTotals.set('Amazon FBA Fees::Amazon FBA Fees - Shipping Chargeback', shippingChargeback);
    memoTotals.set('Amazon FBA Fees::Amazon FBA Fees - FBA Per Unit Fulfilment Fee', fbaPerUnit);

    if (acc.awdFees !== 0) {
      memoTotals.set('AWD::Amazon Storage Fees - AWD Fees', acc.awdFees);
    }
    if (amazonFcTotal !== 0) {
      memoTotals.set('Amazon FC::Amazon Storage Fees - Storage Fee', acc.amazonFcFees);
      memoTotals.set('Amazon FC::Amazon FBA Fees - Fee Adjustments', acc.amazonFcAdjustments);
    }

    const salesTaxPrincipal = acc.salesTaxPrincipal;
    const refundsTaxPrincipal = acc.refundsTaxPrincipal;
    const salesTaxShipping = acc.salesTaxShipping;
    const withheldPrincipal = -salesTaxPrincipal;
    const refundedWithheldPrincipal = -refundsTaxPrincipal;
    const withheldShipping = -salesTaxShipping;

    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Sales Tax (Principal)', salesTaxPrincipal);
    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Refund - Item Price - Tax', refundsTaxPrincipal);
    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Sales Tax (Shipping)', salesTaxShipping);
    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Marketplace Facilitator Tax - (Principal)', withheldPrincipal);
    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Refunded Marketplace Facilitator Tax - (Principal)', refundedWithheldPrincipal);
    memoTotals.set('Amazon Sales Tax (LMB)::Amazon Sales Tax - Marketplace Facilitator Tax - (Shipping)', withheldShipping);

    accountTotals.set('Amazon Sales Tax (LMB)', 0);

    result.set(settlementId, { accountTotals, memoTotals });
  }

  return result;
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toFixed(2)}`;
}

function compareNumbers(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= 0.01;
}

function run() {
  const args = process.argv.slice(2);
  const amazonPaths: string[] = [];
  let ledgerPath = `${process.cwd()}/bookkeeper/TARGON LLC_General Ledger.csv`;
  let txListPath = `${process.cwd()}/bookkeeper/TARGON LLC_Transaction List by Date.csv`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--amazon') {
      const next = args[i + 1];
      if (!next) throw new Error('Missing value for --amazon');
      amazonPaths.push(next);
      i++;
      continue;
    }
    if (arg === '--ledger') {
      const next = args[i + 1];
      if (!next) throw new Error('Missing value for --ledger');
      ledgerPath = next;
      i++;
      continue;
    }
    if (arg === '--txlist') {
      const next = args[i + 1];
      if (!next) throw new Error('Missing value for --txlist');
      txListPath = next;
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (amazonPaths.length === 0) {
    throw new Error('Usage: pnpm tsx scripts/amazon-settlement-compare.ts --amazon <amazon.csv> [--amazon <more.csv>] [--ledger <qbo_general_ledger.csv>] [--txlist <qbo_tx_list.csv>]');
  }

  const amazonTexts = amazonPaths.map((p) => readFileSync(p, 'utf8'));
  const ledgerText = readFileSync(ledgerPath, 'utf8');
  const txListText = readFileSync(txListPath, 'utf8');

  const settlementIdByDoc = loadSettlementIdByDocNumberFromTransactionListByDateCsv(txListText);
  const ledgerByDoc = loadLedgerTotalsByDocNumberFromGeneralLedgerCsv(ledgerText);
  const expectedBySettlementId = computeExpectedTotalsBySettlementId(amazonTexts);

  const docBySettlementId = new Map<string, string>();
  for (const [doc, settlementId] of settlementIdByDoc.entries()) {
    docBySettlementId.set(settlementId, doc);
  }

  let mismatches = 0;

  for (const [settlementId, expected] of expectedBySettlementId.entries()) {
    const docNumber = docBySettlementId.get(settlementId);
    if (!docNumber) continue;

    const actual = ledgerByDoc.get(docNumber);
    if (!actual) {
      process.stdout.write(`not ok - missing General Ledger data for ${docNumber} (settlement ${settlementId})\n`);
      mismatches++;
      continue;
    }

    process.stdout.write(`\nSettlement ${settlementId} -> ${docNumber}\n`);

    for (const [account, expectedTotal] of expected.accountTotals.entries()) {
      const actualTotal = actual.accountTotals.get(account);
      if (actualTotal === undefined) {
        process.stdout.write(`  not ok - ${account}: missing in ledger (expected ${formatDelta(expectedTotal)})\n`);
        mismatches++;
        continue;
      }
      if (!compareNumbers(expectedTotal, actualTotal)) {
        process.stdout.write(`  not ok - ${account}: expected ${formatDelta(expectedTotal)} got ${formatDelta(actualTotal)}\n`);
        mismatches++;
      } else {
        process.stdout.write(`  ok - ${account}: ${formatDelta(actualTotal)}\n`);
      }
    }

    for (const [memoKey, expectedMemoTotal] of expected.memoTotals.entries()) {
      if (expectedMemoTotal === 0) continue;
      const actualMemoTotal = actual.memoTotals.get(memoKey);
      if (actualMemoTotal === undefined) continue;
      if (!compareNumbers(expectedMemoTotal, actualMemoTotal)) {
        process.stdout.write(`  not ok - memo ${memoKey}: expected ${formatDelta(expectedMemoTotal)} got ${formatDelta(actualMemoTotal)}\n`);
        mismatches++;
      }
    }
  }

  if (mismatches > 0) {
    process.stderr.write(`\n${mismatches} mismatches found\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('\nok - all matched\n');
  }
}

run();

