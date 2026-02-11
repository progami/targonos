import type { QboAccount, QboBill } from '@/lib/qbo/api';

export type BillComponent =
  | 'manufacturing'
  | 'freight'
  | 'duty'
  | 'mfgAccessories'
  | 'warehousing3pl'
  | 'warehouseAmazonFc'
  | 'warehouseAwd'
  | 'productExpenses';

export type TrackedBillLine = {
  lineId: string;
  amount: number;
  description: string;
  account: string;
  accountId: string;
  component: BillComponent;
};

export function classifyByInventoryName(account: QboAccount): BillComponent | null {
  if (account.AccountType !== 'Other Current Asset') return null;
  if (account.AccountSubType !== 'Inventory') return null;

  let name = account.Name.trim();
  if (name.startsWith('Inv ')) {
    name = name.slice('Inv '.length).trimStart();
  }

  if (name.startsWith('Manufacturing')) return 'manufacturing';
  if (name.startsWith('Freight')) return 'freight';
  if (name.startsWith('Duty')) return 'duty';
  if (name.startsWith('Mfg Accessories')) return 'mfgAccessories';
  return null;
}

export function buildAccountComponentMap(
  accounts: QboAccount[],
  configAccountIds: {
    warehousing3pl?: string | null;
    warehousingAmazonFc?: string | null;
    warehousingAwd?: string | null;
    productExpenses?: string | null;
  },
): Map<string, BillComponent> {
  const map = new Map<string, BillComponent>();

  function mapParentAndDescendants(parentId: string, component: BillComponent) {
    map.set(parentId, component);
    const queue = [parentId];
    const seen = new Set(queue);

    while (queue.length > 0) {
      const currentId = queue.pop();
      if (!currentId) break;

      for (const account of accounts) {
        if (!account.ParentRef) continue;
        if (account.ParentRef.value !== currentId) continue;
        if (seen.has(account.Id)) continue;

        map.set(account.Id, component);
        seen.add(account.Id);
        queue.push(account.Id);
      }
    }
  }

  const parentEntries: Array<{ id: string | null | undefined; component: BillComponent }> = [
    { id: configAccountIds.warehousing3pl, component: 'warehousing3pl' },
    { id: configAccountIds.warehousingAmazonFc, component: 'warehouseAmazonFc' },
    { id: configAccountIds.warehousingAwd, component: 'warehouseAwd' },
    { id: configAccountIds.productExpenses, component: 'productExpenses' },
  ];

  for (const entry of parentEntries) {
    if (!entry.id) continue;
    mapParentAndDescendants(entry.id, entry.component);
  }

  for (const account of accounts) {
    if (map.has(account.Id)) continue;
    const component = classifyByInventoryName(account);
    if (component) {
      map.set(account.Id, component);
    }
  }

  return map;
}

export function extractTrackedLinesFromBill(
  bill: QboBill,
  accountComponentMap: Map<string, BillComponent>,
): TrackedBillLine[] {
  const trackedLines: TrackedBillLine[] = [];
  for (const line of bill.Line ?? []) {
    if (!line.AccountBasedExpenseLineDetail) continue;
    const accountId = line.AccountBasedExpenseLineDetail.AccountRef.value;
    const component = accountComponentMap.get(accountId);
    if (!component) continue;

    trackedLines.push({
      lineId: line.Id,
      amount: line.Amount,
      description: line.Description ? line.Description : '',
      account: line.AccountBasedExpenseLineDetail.AccountRef.name,
      accountId,
      component,
    });
  }

  return trackedLines;
}
