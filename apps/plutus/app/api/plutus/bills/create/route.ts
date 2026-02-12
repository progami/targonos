import { NextRequest, NextResponse } from 'next/server';
import {
  createBill,
  fetchAccounts,
  fetchCurrencies,
  fetchPreferences,
  fetchTerms,
  fetchVendors,
  QboAuthError,
  uploadBillAttachment,
  type QboAccount,
  type QboPreferences,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';
import { buildAccountComponentMap, type BillComponent } from '@/lib/plutus/bills/classification';

const logger = createLogger({ name: 'plutus-bills-create' });

const COMPONENT_ACCOUNT_KEYS: Record<BillComponent, string> = {
  manufacturing: 'invManufacturing',
  freight: 'invFreight',
  duty: 'invDuty',
  mfgAccessories: 'invMfgAccessories',
  warehousing3pl: 'warehousing3pl',
  warehouseAmazonFc: 'warehousingAmazonFc',
  warehouseAwd: 'warehousingAwd',
  productExpenses: 'productExpenses',
};

const VALID_COMPONENTS = new Set<string>(Object.keys(COMPONENT_ACCOUNT_KEYS));
const MAX_BILL_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_BILL_ATTACHMENT_COUNT = 20;

function findSubAccountByParentId(accounts: QboAccount[], parentAccountId: string, name: string): QboAccount | undefined {
  return accounts.find((account) => account.ParentRef?.value === parentAccountId && account.Name === name);
}

function getBrandSubAccountName(component: BillComponent, brandName: string): string {
  switch (component) {
    case 'manufacturing':
      return `Manufacturing - ${brandName}`;
    case 'freight':
      return `Freight - ${brandName}`;
    case 'duty':
      return `Duty - ${brandName}`;
    case 'mfgAccessories':
      return `Mfg Accessories - ${brandName}`;
    case 'warehousing3pl':
    case 'warehouseAmazonFc':
    case 'warehouseAwd':
      return brandName;
    case 'productExpenses':
      return `Product Expenses - ${brandName}`;
  }
}

function getComponentDefaultDescription(component: BillComponent): string {
  switch (component) {
    case 'manufacturing':
      return 'Manufacturing';
    case 'freight':
      return 'Freight';
    case 'duty':
      return 'Duty';
    case 'mfgAccessories':
      return 'Mfg Accessories';
    case 'warehousing3pl':
      return '3PL Warehousing';
    case 'warehouseAmazonFc':
      return 'Amazon FC Warehousing';
    case 'warehouseAwd':
      return 'AWD Warehousing';
    case 'productExpenses':
      return 'Product Expenses';
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function asOptionalPositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function asOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function formatVendorBillAddress(address: {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
} | undefined): string {
  if (!address) return '';

  const lines: string[] = [];
  for (const candidate of [address.Line1, address.Line2, address.Line3, address.Line4, address.Line5]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      lines.push(candidate.trim());
    }
  }

  const cityRegionPostal = [address.City, address.CountrySubDivisionCode, address.PostalCode]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .map((part) => (part as string).trim())
    .join(', ');
  if (cityRegionPostal !== '') {
    lines.push(cityRegionPostal);
  }

  if (typeof address.Country === 'string' && address.Country.trim() !== '') {
    lines.push(address.Country.trim());
  }

  return lines.join('\n');
}

function resolvePoCustomField(preferences: QboPreferences): {
  enabled: boolean;
  definitionId?: string;
  name?: string;
  type: 'StringType' | 'NumberType' | 'BooleanType';
} {
  const poField = preferences.VendorAndPurchasePrefs?.POCustomField;
  if (!poField) {
    return { enabled: false, type: 'StringType' };
  }

  let definitionId = asOptionalString(poField.DefinitionId);
  let name = asOptionalString(poField.Name);
  let type: 'StringType' | 'NumberType' | 'BooleanType' =
    poField.Type === 'NumberType' || poField.Type === 'BooleanType' ? poField.Type : 'StringType';

  const firstCustomField = Array.isArray(poField.CustomField) && poField.CustomField.length > 0
    ? poField.CustomField[0]
    : null;

  if (firstCustomField) {
    if (!definitionId) {
      definitionId = asOptionalString(firstCustomField.DefinitionId);
    }
    if (!name) {
      name = asOptionalString(firstCustomField.Name);
    }
    if (firstCustomField.Type === 'NumberType' || firstCustomField.Type === 'BooleanType' || firstCustomField.Type === 'StringType') {
      type = firstCustomField.Type;
    }
  }

  const hasIdentifier = Boolean(definitionId || name);
  return {
    enabled: hasIdentifier,
    definitionId,
    name,
    type,
  };
}

export async function GET() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let activeConnection = connection;

    const preferencesResult = await fetchPreferences(activeConnection);
    if (preferencesResult.updatedConnection) {
      activeConnection = preferencesResult.updatedConnection;
    }

    const accountsResult = await fetchAccounts(activeConnection);
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }

    const vendorsResult = await fetchVendors(activeConnection);
    if (vendorsResult.updatedConnection) {
      activeConnection = vendorsResult.updatedConnection;
    }

    const termsResult = await fetchTerms(activeConnection);
    if (termsResult.updatedConnection) {
      activeConnection = termsResult.updatedConnection;
    }

    const multiCurrencyEnabled = preferencesResult.preferences.CurrencyPrefs?.MultiCurrencyEnabled === true;
    let currencies: Array<{ code: string; name: string | null }> = [];

    if (multiCurrencyEnabled) {
      const currenciesResult = await fetchCurrencies(activeConnection);
      if (currenciesResult.updatedConnection) {
        activeConnection = currenciesResult.updatedConnection;
      }
      currencies = currenciesResult.currencies
        .filter((currency) => typeof currency.Code === 'string' && currency.Code.trim() !== '')
        .map((currency) => ({
          code: currency.Code ? currency.Code : '',
          name: currency.Name ? currency.Name : null,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const config = await db.setupConfig.findFirst();
    const accountComponentMap = buildAccountComponentMap(accountsResult.accounts, {
      warehousing3pl: config?.warehousing3pl,
      warehousingAmazonFc: config?.warehousingAmazonFc,
      warehousingAwd: config?.warehousingAwd,
      productExpenses: config?.productExpenses,
    });

    const vendors = vendorsResult.vendors
      .map((vendor) => ({
        id: vendor.Id,
        name: vendor.DisplayName,
        currencyCode: vendor.CurrencyRef?.value ? vendor.CurrencyRef.value : null,
        billAddress: formatVendorBillAddress(vendor.BillAddr),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const accounts = accountsResult.accounts
      .filter((account) => account.Active !== false)
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName ? account.FullyQualifiedName : account.Name,
        accountType: account.AccountType,
        accountSubType: account.AccountSubType ? account.AccountSubType : null,
        classification: account.Classification ? account.Classification : null,
        component: accountComponentMap.get(account.Id) ?? null,
      }))
      .sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));

    const terms = termsResult.terms
      .map((term) => ({
        id: term.Id,
        name: term.Name,
        dueDays: term.DueDays ?? null,
        type: term.Type ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const brands = await db.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const skus = await db.sku.findMany({
      select: { id: true, sku: true, productName: true, brandId: true },
      orderBy: { sku: 'asc' },
    });

    const poCustomField = resolvePoCustomField(preferencesResult.preferences);

    return NextResponse.json({
      vendors,
      accounts,
      terms,
      currencies,
      brands,
      skus,
      preferences: {
        homeCurrency: preferencesResult.preferences.CurrencyPrefs?.HomeCurrency?.value ?? null,
        multiCurrencyEnabled,
        classTrackingPerTxn: preferencesResult.preferences.AccountingInfoPrefs?.ClassTrackingPerTxn === true,
        classTrackingPerTxnLine: preferencesResult.preferences.AccountingInfoPrefs?.ClassTrackingPerTxnLine === true,
        trackDepartments: preferencesResult.preferences.AccountingInfoPrefs?.TrackDepartments === true,
        poCustomField,
      },
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to fetch bill create context', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill create context', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') ?? '';
    let body: Record<string, unknown>;
    let attachments: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const payloadRaw = formData.get('payload');
      if (typeof payloadRaw !== 'string' || payloadRaw.trim() === '') {
        return NextResponse.json({ error: 'Missing payload in multipart request' }, { status: 400 });
      }
      try {
        body = JSON.parse(payloadRaw) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON payload in multipart request' }, { status: 400 });
      }
      attachments = formData
        .getAll('files')
        .filter((entry): entry is File => entry instanceof File);
    } else {
      body = await req.json() as Record<string, unknown>;
    }

    if (attachments.length > MAX_BILL_ATTACHMENT_COUNT) {
      return NextResponse.json(
        { error: `Too many attachments. Maximum allowed is ${MAX_BILL_ATTACHMENT_COUNT}.` },
        { status: 400 },
      );
    }
    for (const attachment of attachments) {
      if (attachment.size > MAX_BILL_ATTACHMENT_SIZE_BYTES) {
        return NextResponse.json(
          {
            error: `Attachment "${attachment.name}" exceeds 20MB limit.`,
          },
          { status: 400 },
        );
      }
    }

    const txnDate = asNonEmptyString(body.txnDate);
    const vendorId = asNonEmptyString(body.vendorId);
    const poNumber = asOptionalString(body.poNumber) ?? '';
    const brandId = asOptionalString(body.brandId) ?? '';
    const memo = asOptionalString(body.memo);
    const dueDate = asOptionalString(body.dueDate);
    const docNumber = asOptionalString(body.docNumber);
    const salesTermId = asOptionalString(body.termId) ?? asOptionalString(body.salesTermId);
    const currencyCode = asOptionalString(body.currencyCode)?.toUpperCase();
    const exchangeRate = asOptionalPositiveNumber(body.exchangeRate);

    if (!txnDate) {
      return NextResponse.json({ error: 'txnDate is required' }, { status: 400 });
    }
    if (!vendorId) {
      return NextResponse.json({ error: 'vendorId is required' }, { status: 400 });
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    let activeConnection = connection;

    const accountsResult = await fetchAccounts(activeConnection);
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }

    const preferencesResult = await fetchPreferences(activeConnection);
    if (preferencesResult.updatedConnection) {
      activeConnection = preferencesResult.updatedConnection;
    }

    const homeCurrency = preferencesResult.preferences.CurrencyPrefs?.HomeCurrency?.value;
    const multiCurrencyEnabled = preferencesResult.preferences.CurrencyPrefs?.MultiCurrencyEnabled === true;

    if (currencyCode && !multiCurrencyEnabled && homeCurrency && currencyCode !== homeCurrency) {
      return NextResponse.json(
        { error: `Multi-currency is disabled in QBO. Only ${homeCurrency} bills are allowed.` },
        { status: 400 },
      );
    }

    const config = await db.setupConfig.findFirst();
    const accountComponentMap = buildAccountComponentMap(accountsResult.accounts, {
      warehousing3pl: config?.warehousing3pl,
      warehousingAmazonFc: config?.warehousingAmazonFc,
      warehousingAwd: config?.warehousingAwd,
      productExpenses: config?.productExpenses,
    });

    const accountsById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));

    const brand = brandId === ''
      ? null
      : await db.brand.findUnique({ where: { id: brandId } });

    if (brandId !== '' && !brand) {
      return NextResponse.json({ error: 'Invalid brandId' }, { status: 400 });
    }

    const qboLines: Array<{
      amount: number;
      accountId: string;
      description?: string;
      classId?: string;
      customerId?: string;
      taxCodeId?: string;
    }> = [];

    const mappingLines: Array<{
      lineIndex: number;
      component: BillComponent;
      amountCents: number;
      sku: string | null;
      quantity: number | null;
    }> = [];

    for (const rawLine of body.lines as Array<Record<string, unknown>>) {
      const amount = rawLine.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Each line must have a positive amount' }, { status: 400 });
      }

      const lineDescription = asOptionalString(rawLine.description);
      const lineSku = asOptionalString(rawLine.sku);
      const lineQuantity = asOptionalPositiveInteger(rawLine.quantity);

      let resolvedAccountId: string | null = null;
      let trackedComponent: BillComponent | null = null;

      const explicitAccountId = asOptionalString(rawLine.accountId);
      const legacyComponent = asOptionalString(rawLine.component);

      if (explicitAccountId) {
        const account = accountsById.get(explicitAccountId);
        if (!account) {
          return NextResponse.json({ error: `Invalid accountId: ${explicitAccountId}` }, { status: 400 });
        }
        resolvedAccountId = explicitAccountId;

        if (legacyComponent && VALID_COMPONENTS.has(legacyComponent)) {
          trackedComponent = legacyComponent as BillComponent;
        } else {
          trackedComponent = accountComponentMap.get(explicitAccountId) ?? null;
        }
      } else if (legacyComponent && VALID_COMPONENTS.has(legacyComponent)) {
        if (!config || config.accountsCreated !== true) {
          return NextResponse.json(
            { error: 'Plutus account setup is incomplete. Complete Setup before using component-based bill lines.' },
            { status: 400 },
          );
        }

        if (!brand) {
          return NextResponse.json(
            { error: 'brandId is required for component-based bill lines' },
            { status: 400 },
          );
        }

        const accountKey = COMPONENT_ACCOUNT_KEYS[legacyComponent as BillComponent];
        const parentAccountId = (config as Record<string, unknown>)[accountKey] as string | null;
        if (!parentAccountId) {
          return NextResponse.json(
            { error: `Account mapping for ${legacyComponent} is not configured. Go to Settings to set up accounts.` },
            { status: 400 },
          );
        }

        const subAccountName = getBrandSubAccountName(legacyComponent as BillComponent, brand.name);
        const subAccount = findSubAccountByParentId(accountsResult.accounts, parentAccountId, subAccountName);
        if (!subAccount) {
          return NextResponse.json(
            {
              error: `Missing QBO brand sub-account: "${subAccountName}" (parentAccountId=${parentAccountId}). Run Setup -> Create Accounts.`,
            },
            { status: 400 },
          );
        }

        resolvedAccountId = subAccount.Id;
        trackedComponent = legacyComponent as BillComponent;
      } else {
        return NextResponse.json({ error: 'Each line requires either accountId or a valid component' }, { status: 400 });
      }

      if (!resolvedAccountId) {
        return NextResponse.json({ error: 'Failed to resolve bill line account' }, { status: 400 });
      }

      if (trackedComponent === 'manufacturing' && (!lineSku || lineQuantity === null)) {
        return NextResponse.json(
          { error: 'Manufacturing lines require sku and quantity' },
          { status: 400 },
        );
      }

      let description = lineDescription;
      if (!description) {
        if (lineSku && lineQuantity !== null) {
          description = `${lineSku} x ${lineQuantity} units`;
        } else if (lineSku) {
          description = lineSku;
        } else if (trackedComponent) {
          description = getComponentDefaultDescription(trackedComponent);
        } else {
          const account = accountsById.get(resolvedAccountId);
          description = account?.FullyQualifiedName ? account.FullyQualifiedName : account?.Name;
        }
      }

      qboLines.push({
        amount,
        accountId: resolvedAccountId,
        description,
        classId: asOptionalString(rawLine.classId),
        customerId: asOptionalString(rawLine.customerId),
        taxCodeId: asOptionalString(rawLine.taxCodeId),
      });

      if (trackedComponent) {
        mappingLines.push({
          lineIndex: qboLines.length - 1,
          component: trackedComponent,
          amountCents: Math.round(amount * 100),
          sku: lineSku ?? null,
          quantity: lineQuantity,
        });
      }
    }

    if (mappingLines.length > 0 && poNumber === '') {
      return NextResponse.json({ error: 'poNumber is required when posting tracked bill lines' }, { status: 400 });
    }

    if (mappingLines.length > 0 && !brand) {
      return NextResponse.json({ error: 'brandId is required when posting tracked bill lines' }, { status: 400 });
    }

    const poCustomField = resolvePoCustomField(preferencesResult.preferences);
    const canWritePoCustomField = poNumber !== '' && poCustomField.enabled && poCustomField.type === 'StringType';
    const customFields = canWritePoCustomField
      ? [{
          definitionId: poCustomField.definitionId,
          name: poCustomField.name,
          type: 'StringType' as const,
          value: poNumber,
        }]
      : undefined;

    const privateNoteParts: string[] = [];
    if (poNumber !== '' && !canWritePoCustomField) {
      privateNoteParts.push(`PO: ${poNumber}`);
    }
    if (memo) {
      privateNoteParts.push(memo);
    }

    const { bill, updatedConnection } = await createBill(activeConnection, {
      txnDate,
      vendorId,
      dueDate,
      docNumber,
      salesTermId,
      currencyCode,
      exchangeRate,
      privateNote: privateNoteParts.length > 0 ? privateNoteParts.join('\n') : undefined,
      customFields,
      lines: qboLines,
    });

    if (updatedConnection) {
      activeConnection = updatedConnection;
    }

    const uploadedAttachments: Array<{ fileName: string; attachableId: string }> = [];
    for (const attachment of attachments) {
      const uploadResult = await uploadBillAttachment(activeConnection, {
        billId: bill.Id,
        fileName: attachment.name !== '' ? attachment.name : 'attachment',
        contentType: attachment.type !== '' ? attachment.type : 'application/octet-stream',
        bytes: new Uint8Array(await attachment.arrayBuffer()),
      });
      if (uploadResult.updatedConnection) {
        activeConnection = uploadResult.updatedConnection;
      }
      uploadedAttachments.push({
        fileName: attachment.name !== '' ? attachment.name : 'attachment',
        attachableId: uploadResult.attachableId,
      });
    }
    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    let mappingResult: {
      id: string;
      qboBillId: string;
      poNumber: string;
      brandId: string;
      billDate: string;
      vendorName: string;
      totalAmount: number;
      syncedAt: Date | null;
      lines: Array<{
        qboLineId: string;
        component: string;
        amountCents: number;
        sku: string | null;
        quantity: number | null;
      }>;
    } | null = null;

    if (mappingLines.length > 0 && brand) {
      const mapping = await db.billMapping.create({
        data: {
          qboBillId: bill.Id,
          poNumber,
          brandId: brand.id,
          billDate: txnDate,
          vendorName: bill.VendorRef?.name ?? '',
          totalAmount: bill.TotalAmt,
          syncedAt: new Date(),
        },
      });

      const billLines = bill.Line ?? [];
      await db.billLineMapping.createMany({
        data: mappingLines.map((line) => ({
          billMappingId: mapping.id,
          qboLineId: billLines[line.lineIndex]?.Id ?? `line-${line.lineIndex}`,
          component: line.component,
          amountCents: line.amountCents,
          sku: line.sku,
          quantity: line.quantity,
        })),
      });

      mappingResult = await db.billMapping.findUnique({
        where: { id: mapping.id },
        include: {
          lines: {
            select: {
              qboLineId: true,
              component: true,
              amountCents: true,
              sku: true,
              quantity: true,
            },
          },
        },
      });
    }

    return NextResponse.json({ bill, mapping: mappingResult, attachments: uploadedAttachments });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to create bill', error);
    return NextResponse.json(
      { error: 'Failed to create bill', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
