'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

const STORAGE_KEY = 'plutus-setup-v5'; // Bump version for DB-backed state

const MARKETPLACES = [
  { id: 'amazon.com', label: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', label: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', label: 'Amazon.de', currency: 'EUR' },
  { id: 'amazon.fr', label: 'Amazon.fr', currency: 'EUR' },
  { id: 'amazon.es', label: 'Amazon.es', currency: 'EUR' },
  { id: 'amazon.it', label: 'Amazon.it', currency: 'EUR' },
] as const;

type Brand = { name: string; marketplace: string; currency: string };
type Sku = { sku: string; productName: string; brand: string; asin?: string };

type SetupState = {
  section: 'brands' | 'accounts' | 'skus';
  brands: Brand[];
  accountMappings: Record<string, string>;
  accountsCreated: boolean;
  skus: Sku[];
};

type QboAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  acctNum?: string | null;
  type: string;
  active: boolean;
};

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function accountDepth(account: QboAccount): number {
  return account.fullyQualifiedName.split(':').length - 1;
}

function findAccountByExactName(
  accounts: QboAccount[],
  input: {
    name: string;
    type: string;
  },
): QboAccount | undefined {
  const expectedName = normalizeForMatch(input.name);
  const expectedType = input.type;

  const candidates = accounts.filter((account) => {
    if (account.type !== expectedType) return false;
    if (normalizeForMatch(account.name) !== expectedName) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;

  const activeCandidates = candidates.filter((account) => account.active);
  const preferred = activeCandidates.length > 0 ? activeCandidates : candidates;

  const sorted = [...preferred].sort((a, b) => {
    const depthA = accountDepth(a);
    const depthB = accountDepth(b);
    if (depthA !== depthB) return depthA - depthB;
    return a.fullyQualifiedName.localeCompare(b.fullyQualifiedName);
  });

  return sorted[0];
}

function findAccountByFullyQualifiedName(
  accounts: QboAccount[],
  input: {
    fullyQualifiedName: string;
    type: string;
  },
): QboAccount | undefined {
  const expectedFullyQualifiedName = normalizeForMatch(input.fullyQualifiedName);
  const expectedType = input.type;

  const candidates = accounts.filter((account) => {
    if (account.type !== expectedType) return false;
    if (normalizeForMatch(account.fullyQualifiedName) !== expectedFullyQualifiedName) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;

  const activeCandidates = candidates.filter((account) => account.active);
  const preferred = activeCandidates.length > 0 ? activeCandidates : candidates;

  const sorted = [...preferred].sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
  return sorted[0];
}

function suggestPlutusAccountMappings(accounts: QboAccount[]): Record<string, string> {
  const suggestions: Record<string, string> = {};

  const inventoryAsset = findAccountByExactName(accounts, {
    name: 'Inventory Asset',
    type: 'Other Current Asset',
  });
  if (inventoryAsset) {
    suggestions.invManufacturing = inventoryAsset.id;
    suggestions.invFreight = inventoryAsset.id;
    suggestions.invDuty = inventoryAsset.id;
    suggestions.invMfgAccessories = inventoryAsset.id;
  }

  const freightAndDuty = findAccountByExactName(accounts, {
    name: 'Freight & Custom Duty',
    type: 'Cost of Goods Sold',
  });
  if (freightAndDuty) {
    suggestions.cogsFreight = freightAndDuty.id;
    suggestions.cogsDuty = freightAndDuty.id;
  }

  const manufacturing = findAccountByExactName(accounts, { name: 'Manufacturing', type: 'Cost of Goods Sold' });
  if (manufacturing) {
    suggestions.cogsManufacturing = manufacturing.id;
  }

  const mfgAccessories = findAccountByExactName(accounts, { name: 'Mfg Accessories', type: 'Cost of Goods Sold' });
  if (mfgAccessories) {
    suggestions.cogsMfgAccessories = mfgAccessories.id;
  }

  const warehousing3pl = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:3PL',
    type: 'Cost of Goods Sold',
  });
  if (warehousing3pl) {
    suggestions.warehousing3pl = warehousing3pl.id;
  }

  const warehousingAmazonFc = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:Amazon FC',
    type: 'Cost of Goods Sold',
  });
  if (warehousingAmazonFc) {
    suggestions.warehousingAmazonFc = warehousingAmazonFc.id;
  }

  const warehousingAwd = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:AWD',
    type: 'Cost of Goods Sold',
  });
  if (warehousingAwd) {
    suggestions.warehousingAwd = warehousingAwd.id;
  }

  const shrinkage = findAccountByExactName(accounts, { name: 'Inventory Shrinkage', type: 'Cost of Goods Sold' });
  if (shrinkage) {
    suggestions.cogsShrinkage = shrinkage.id;
  }

  const amazonSales = findAccountByExactName(accounts, { name: 'Amazon Sales', type: 'Income' });
  if (amazonSales) {
    suggestions.amazonSales = amazonSales.id;
  }

  const amazonRefunds = findAccountByExactName(accounts, { name: 'Amazon Refunds', type: 'Income' });
  if (amazonRefunds) {
    suggestions.amazonRefunds = amazonRefunds.id;
  }

  const reimbursement = findAccountByExactName(accounts, { name: 'Amazon FBA Inventory Reimbursement', type: 'Other Income' });
  if (reimbursement) {
    suggestions.amazonFbaInventoryReimbursement = reimbursement.id;
  }

  const sellerFees = findAccountByExactName(accounts, { name: 'Amazon Seller Fees', type: 'Cost of Goods Sold' });
  if (sellerFees) {
    suggestions.amazonSellerFees = sellerFees.id;
  }

  const fbaFees = findAccountByExactName(accounts, { name: 'Amazon FBA Fees', type: 'Cost of Goods Sold' });
  if (fbaFees) {
    suggestions.amazonFbaFees = fbaFees.id;
  }

  const storageFees = findAccountByExactName(accounts, { name: 'Amazon Storage Fees', type: 'Cost of Goods Sold' });
  if (storageFees) {
    suggestions.amazonStorageFees = storageFees.id;
  }

  const advertisingCosts = findAccountByExactName(accounts, { name: 'Amazon Advertising Costs', type: 'Cost of Goods Sold' });
  if (advertisingCosts) {
    suggestions.amazonAdvertisingCosts = advertisingCosts.id;
  }

  const promotions = findAccountByExactName(accounts, { name: 'Amazon Promotions', type: 'Cost of Goods Sold' });
  if (promotions) {
    suggestions.amazonPromotions = promotions.id;
  }

  const productExpenses = findAccountByExactName(accounts, { name: 'Product Expenses', type: 'Expense' });
  if (productExpenses) {
    suggestions.productExpenses = productExpenses.id;
  }

  return suggestions;
}

// Account definitions
const INVENTORY_ACCOUNTS = [
  { key: 'invManufacturing', label: 'Manufacturing', type: 'Other Current Asset' },
  { key: 'invFreight', label: 'Freight', type: 'Other Current Asset' },
  { key: 'invDuty', label: 'Duty', type: 'Other Current Asset' },
  { key: 'invMfgAccessories', label: 'Mfg Accessories', type: 'Other Current Asset' },
];

const COGS_ACCOUNTS = [
  { key: 'cogsManufacturing', label: 'Manufacturing', type: 'Cost of Goods Sold' },
  { key: 'cogsFreight', label: 'Freight', type: 'Cost of Goods Sold' },
  { key: 'cogsDuty', label: 'Duty', type: 'Cost of Goods Sold' },
  { key: 'cogsMfgAccessories', label: 'Mfg Accessories', type: 'Cost of Goods Sold' },
  { key: 'cogsShrinkage', label: 'Shrinkage', type: 'Cost of Goods Sold' },
];

const WAREHOUSING_ACCOUNTS = [
  { key: 'warehousing3pl', label: '3PL', type: 'Cost of Goods Sold' },
  { key: 'warehousingAmazonFc', label: 'Amazon FC', type: 'Cost of Goods Sold' },
  { key: 'warehousingAwd', label: 'AWD', type: 'Cost of Goods Sold' },
];

const PRODUCT_EXPENSES_ACCOUNTS = [
  { key: 'productExpenses', label: 'Product Expenses', type: 'Expense' },
];

const LMB_ACCOUNTS = [
  { key: 'amazonSales', label: 'Amazon Sales', type: 'Income' },
  { key: 'amazonRefunds', label: 'Amazon Refunds', type: 'Income' },
  { key: 'amazonFbaInventoryReimbursement', label: 'FBA Reimbursement', type: 'Other Income' },
  { key: 'amazonSellerFees', label: 'Seller Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonFbaFees', label: 'FBA Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonStorageFees', label: 'Storage Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonAdvertisingCosts', label: 'Advertising', type: 'Cost of Goods Sold' },
  { key: 'amazonPromotions', label: 'Promotions', type: 'Cost of Goods Sold' },
];

const ALL_ACCOUNTS = [...INVENTORY_ACCOUNTS, ...COGS_ACCOUNTS, ...WAREHOUSING_ACCOUNTS, ...PRODUCT_EXPENSES_ACCOUNTS, ...LMB_ACCOUNTS];

// Sidebar
function Sidebar({
  section,
  onSectionChange,
  brandsComplete,
  accountsComplete,
  skusComplete,
}: {
  section: string;
  onSectionChange: (s: 'brands' | 'accounts' | 'skus') => void;
  brandsComplete: boolean;
  accountsComplete: boolean;
  skusComplete: boolean;
}) {
  const items = [
    { id: 'brands' as const, label: 'Brands', complete: brandsComplete },
    { id: 'accounts' as const, label: 'Map accounts', complete: accountsComplete },
    { id: 'skus' as const, label: 'Inventory', complete: skusComplete },
  ];

  return (
    <Box
      component="nav"
      sx={{
        width: { xs: '100%', md: 288 },
        flexShrink: 0,
        borderBottom: { xs: 1, md: 0 },
        borderRight: { xs: 0, md: 1 },
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
        <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
          Wizard
        </Box>
      </Box>

      <Box component="ol" sx={{ position: 'relative', px: 2.5, pb: 2.5 }}>
        {items.map((item, index) => {
          const isActive = section === item.id;
          const isLast = index === items.length - 1;

          return (
            <Box component="li" key={item.id} sx={{ position: 'relative', pl: 4.5, ...(!isLast && { pb: 3 }), listStyle: 'none' }}>
              {!isLast && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: '13px',
                    top: 28,
                    height: '100%',
                    width: '1px',
                    bgcolor: 'divider',
                  }}
                />
              )}

              <Box
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: 6,
                  display: 'flex',
                  height: 24,
                  width: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 99,
                  border: 1,
                  ...(item.complete
                    ? { bgcolor: '#10b981', borderColor: '#10b981', color: '#fff' }
                    : isActive
                      ? { bgcolor: 'background.paper', borderColor: '#45B3D4', color: '#45B3D4' }
                      : { bgcolor: 'background.paper', borderColor: 'divider', color: 'text.disabled' }),
                }}
              >
                {item.complete ? (
                  <CheckIcon sx={{ fontSize: 16 }} />
                ) : (
                  <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{index + 1}</Box>
                )}
              </Box>

              <Box
                component="button"
                onClick={() => onSectionChange(item.id)}
                sx={{
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  transition: 'color 0.15s',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  p: 0,
                  ...(isActive
                    ? { fontWeight: 600, color: 'text.primary' }
                    : { color: 'text.secondary', '&:hover': { color: 'text.primary' } }),
                }}
              >
                {item.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// Brands Section
function BrandsSection({
  brands,
  onBrandsChange,
}: {
  brands: Brand[];
  onBrandsChange: (brands: Brand[]) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newMarketplace, setNewMarketplace] = useState('amazon.com');

  const addBrand = () => {
    const name = newName.trim();
    if (!name || brands.some((b) => b.name === name)) return;
    const mp = MARKETPLACES.find((m) => m.id === newMarketplace);
    if (!mp) return;
    onBrandsChange([...brands, { name, marketplace: mp.id, currency: mp.currency }]);
    setNewName('');
  };

  const removeBrand = (index: number) => {
    onBrandsChange(brands.filter((_, i) => i !== index));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>Brands</Typography>
      </Box>

      {brands.length > 0 && (
        <Card sx={{ border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead sx={{ width: 48, textAlign: 'right' }}> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((brand, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{brand.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        {MARKETPLACES.find((m) => m.id === brand.marketplace)?.label}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{brand.currency}</TableCell>
                      <TableCell sx={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="icon" onClick={() => removeBrand(i)} aria-label={`Remove brand ${brand.name}`}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card sx={{ border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { sm: '1fr 240px auto' }, alignItems: { sm: 'end' } }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Brand name
              </Box>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' ? addBrand() : undefined)}
                placeholder="US-Dust Sheets"
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Marketplace
              </Box>
              <Select value={newMarketplace} onValueChange={setNewMarketplace} placeholder="Select marketplace...">
                {MARKETPLACES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button onClick={addBrand} disabled={!newName.trim()} startIcon={<AddIcon sx={{ fontSize: 16 }} />}>
                Add Brand
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// Account Row
function AccountRow({
  label,
  accountId,
  accounts,
  onChange,
  type,
}: {
  label: string;
  accountId: string;
  accounts: QboAccount[];
  onChange: (id: string) => void;
  type?: string;
}) {
  const filtered = type ? accounts.filter((a) => a.type === type) : accounts;
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <TableRow>
      <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
        {label}
      </TableCell>
      <TableCell>
        <Select
          value={accountId}
          onValueChange={onChange}
          placeholder="Select parent account..."
          sx={{
            bgcolor: 'background.paper',
            ...(selected && {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#45B3D4',
              },
            }),
          }}
        >
          {filtered.map((a) => {
            const label = a.acctNum ? `${a.acctNum} \u00B7 ${a.fullyQualifiedName}` : a.fullyQualifiedName;
            return (
              <SelectItem key={a.id} value={a.id}>
                {label}
              </SelectItem>
            );
          })}
        </Select>
      </TableCell>
      <TableCell sx={{ width: 48, textAlign: 'right' }}>
        {selected && <CheckIcon sx={{ fontSize: 16, color: '#22c55e' }} />}
      </TableCell>
    </TableRow>
  );
}

// Accounts Section
function AccountsSection({
  isQboConnected,
  accounts,
  accountMappings,
  onAccountMappingsChange,
  brands,
  onAccountsCreated,
  accountsCreated,
  isLoadingAccounts,
}: {
  isQboConnected: boolean;
  accounts: QboAccount[];
  accountMappings: Record<string, string>;
  onAccountMappingsChange: (accounts: Record<string, string>) => void;
  brands: Brand[];
  onAccountsCreated: () => void;
  accountsCreated: boolean;
  isLoadingAccounts: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEnsureSummary, setLastEnsureSummary] = useState<{ created: number; skipped: number } | null>(null);

  const mappedCount = ALL_ACCOUNTS.filter((a) => accountMappings[a.key]).length;
  const allMapped = mappedCount === ALL_ACCOUNTS.length;

  const updateAccount = (key: string, id: string) => {
    onAccountMappingsChange({ ...accountMappings, [key]: id });
  };

  const suggestedMappings = useMemo(() => suggestPlutusAccountMappings(accounts), [accounts]);

  useEffect(() => {
    if (!isQboConnected) return;
    if (isLoadingAccounts) return;
    if (accounts.length === 0) return;

    const next = { ...accountMappings };
    let changed = false;
    for (const [key, value] of Object.entries(suggestedMappings)) {
      const current = next[key];
      const isEmpty = current === undefined ? true : current === '';
      if (isEmpty && value !== '') {
        next[key] = value;
        changed = true;
      }
    }

    if (changed) {
      onAccountMappingsChange(next);
    }
  }, [accountMappings, accounts.length, isLoadingAccounts, isQboConnected, onAccountMappingsChange, suggestedMappings]);

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  const createAccounts = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/qbo/accounts/create-plutus-qbo-lmb-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandNames: brands.map((b) => b.name),
          accountMappings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error ? data.error : 'Failed to create accounts';
        throw new Error(message);
      }

      if (!Array.isArray(data.created) || !Array.isArray(data.skipped)) {
        throw new Error('Unexpected response from account creation endpoint');
      }

      setLastEnsureSummary({ created: data.created.length, skipped: data.skipped.length });
      onAccountsCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create accounts');
    } finally {
      setCreating(false);
    }
  };

  if (brands.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>Add brands first before mapping accounts.</Typography>
      </Box>
    );
  }

  if (!isQboConnected) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
        <Card sx={{ maxWidth: 448, width: '100%', border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            <Box
              sx={{
                mx: 'auto',
                display: 'flex',
                height: 48,
                width: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                bgcolor: 'action.hover',
                color: 'text.secondary',
              }}
            >
              <AddIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box sx={{ mt: 2, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Connect QuickBooks</Box>
            <Box sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
              Account mapping is available after connecting QBO.
            </Box>
            <Box sx={{ mt: 2.5 }}>
              <Button
                onClick={handleConnect}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  bgcolor: '#45B3D4',
                  '&:hover': { bgcolor: '#2fa3c7' },
                  color: '#fff',
                  boxShadow: '0 4px 14px -3px rgba(69,179,212,0.25)',
                }}
              >
                Connect to QuickBooks
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (isLoadingAccounts) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>Loading QBO accounts...</Typography>
      </Box>
    );
  }

  const renderAccountGroup = (title: string, accountList: Array<{ key: string; label: string; type: string }>) => (
    <Card sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
      <CardContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
            px: 2,
            py: 1.5,
          }}
        >
          <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{title}</Box>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>QBO parent account</TableHead>
                <TableHead sx={{ width: 48, textAlign: 'right' }}> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountList.map((acc) => (
                <AccountRow
                  key={acc.key}
                  label={acc.label}
                  accountId={accountMappings[acc.key] ? accountMappings[acc.key] : ''}
                  accounts={accounts}
                  onChange={(id) => updateAccount(acc.key, id)}
                  type={acc.type}
                />
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>Account Mapping</Typography>
      </Box>

      {accountsCreated && (
        <Box
          sx={{
            borderRadius: 3,
            border: 1,
            borderColor: 'rgba(16,185,129,0.2)',
            bgcolor: 'rgba(16,185,129,0.05)',
            p: 2,
            fontSize: '0.875rem',
            color: '#065f46',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box
              sx={{
                mt: 0.25,
                display: 'flex',
                height: 32,
                width: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.8)',
                color: '#047857',
                border: 1,
                borderColor: 'rgba(16,185,129,0.2)',
              }}
            >
              <CheckIcon sx={{ fontSize: 16 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontWeight: 600 }}>Sub-accounts ensured in QBO</Box>
              <Box sx={{ mt: 0.25, color: 'rgba(6,95,70,0.8)' }}>
                {lastEnsureSummary
                  ? `Created ${lastEnsureSummary.created}, skipped ${lastEnsureSummary.skipped}.`
                  : `Ready for ${brands.length} brand${brands.length > 1 ? 's' : ''}.`}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {renderAccountGroup('Inventory Asset', INVENTORY_ACCOUNTS)}
        {renderAccountGroup('Cost of Goods Sold', COGS_ACCOUNTS)}
        {renderAccountGroup('Warehousing', WAREHOUSING_ACCOUNTS)}
        {renderAccountGroup('Product Expenses', PRODUCT_EXPENSES_ACCOUNTS)}
        {renderAccountGroup('Revenue & Fees (LMB)', LMB_ACCOUNTS)}
      </Box>

      {error && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.05)', border: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
          <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      <Button
        onClick={createAccounts}
        disabled={!allMapped || creating}
        sx={{ width: '100%' }}
      >
        {creating ? 'Ensuring...' : `Ensure Sub-Accounts for ${brands.length} Brand${brands.length > 1 ? 's' : ''}`}
      </Button>
    </Box>
  );
}

// Marketplace to country mapping for SKU scoping
const MARKETPLACE_COUNTRY: Record<string, 'US' | 'UK'> = {
  'amazon.com': 'US',
  'amazon.co.uk': 'UK',
};

// SKUs Section
function SkusSection({
  skus,
  onSkusChange,
  brands,
}: {
  skus: Sku[];
  onSkusChange: (skus: Sku[]) => void;
  brands: Brand[];
}) {
  const normalizeSkuKey = useCallback((raw: string) => raw.trim().replace(/\s+/g, '-').toUpperCase(), []);

  // Derive unique countries from brands
  const countries = useMemo(() => {
    const set = new Set<'US' | 'UK'>();
    for (const b of brands) {
      const country = MARKETPLACE_COUNTRY[b.marketplace];
      if (country) set.add(country);
    }
    return Array.from(set);
  }, [brands]);

  const [draftSkus, setDraftSkus] = useState<Sku[]>(skus);

  useEffect(() => {
    setDraftSkus(skus);
  }, [skus]);

  // Get brands for a given country
  const brandsForCountry = useCallback((country: 'US' | 'UK') => {
    return brands.filter((b) => MARKETPLACE_COUNTRY[b.marketplace] === country);
  }, [brands]);

  const brandByName = useMemo(() => new Map(brands.map((b) => [b.name, b])), [brands]);

  const keyForSku = useCallback(
    (sku: Sku) => {
      const brand = brandByName.get(sku.brand);
      if (!brand) {
        throw new Error(`Unknown brand: ${sku.brand}`);
      }
      const country = MARKETPLACE_COUNTRY[brand.marketplace];
      if (!country) {
        throw new Error(`Unsupported marketplace for brand: ${brand.marketplace}`);
      }
  return `${country}::${normalizeSkuKey(sku.sku)}`;
    },
    [brandByName, normalizeSkuKey],
  );

  const draftByKey = useMemo(() => {
    const map = new Map<string, Sku>();
    for (const sku of draftSkus) {
      map.set(keyForSku(sku), sku);
    }
    return map;
  }, [draftSkus, keyForSku]);

  const handleRemoveConfiguredSku = useCallback(
    (key: string) => {
      setDraftSkus((prev) => prev.filter((sku) => keyForSku(sku) !== key));
    },
    [keyForSku],
  );

  const handleUpdateConfiguredSku = useCallback(
    (key: string, patch: Partial<Sku>) => {
      setDraftSkus((prev) => {
        const next = [...prev];
        const index = next.findIndex((sku) => keyForSku(sku) === key);
        if (index === -1) return prev;

        const current = next[index];
        if (!current) return prev;

        next[index] = { ...current, ...patch };
        return next;
      });
    },
    [keyForSku],
  );

  const supportedBrands = useMemo(
    () => brands.filter((b) => MARKETPLACE_COUNTRY[b.marketplace] !== undefined),
    [brands],
  );

  const [manualSku, setManualSku] = useState<{ sku: string; productName: string; asin: string; brand: string }>({
    sku: '',
    productName: '',
    asin: '',
    brand: '',
  });

  const handleAddManualSku = useCallback(() => {
    const sku = manualSku.sku.trim();
    if (sku === '') return;
    if (manualSku.brand.trim() === '') return;

    const brand = brandByName.get(manualSku.brand);
    if (!brand) {
      throw new Error(`Unknown brand: ${manualSku.brand}`);
    }
    const country = MARKETPLACE_COUNTRY[brand.marketplace];
    if (!country) {
      throw new Error(`Unsupported marketplace for brand: ${brand.marketplace}`);
    }

    const key = `${country}::${normalizeSkuKey(sku)}`;
    if (draftByKey.has(key)) return;

    const productName = manualSku.productName.trim() === '' ? sku : manualSku.productName.trim();
    const asin = manualSku.asin.trim() === '' ? undefined : manualSku.asin.trim();

    setDraftSkus((prev) => [
      ...prev,
      {
        sku,
        productName,
        asin,
        brand: manualSku.brand.trim(),
      },
    ]);

    setManualSku({ sku: '', productName: '', asin: '', brand: manualSku.brand });
  }, [brandByName, draftByKey, manualSku, normalizeSkuKey]);

  // Save configured SKUs
  const handleSave = useCallback(() => {
    onSkusChange(draftSkus);
  }, [draftSkus, onSkusChange]);

  if (brands.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>Add brands first before adding SKUs.</Typography>
      </Box>
    );
  }

  if (countries.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>No supported marketplaces found. Add US or UK brands first.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>Inventory</Typography>
      </Box>

      <Card sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'action.hover',
              px: 2,
              py: 1.5,
            }}
          >
            <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Configured SKUs</Box>
            <Box sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>{draftSkus.length} total</Box>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product name</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead sx={{ width: 48, textAlign: 'right' }}> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftSkus.length > 0 ? (
                  draftSkus
                    .map((sku) => {
                      const key = keyForSku(sku);
                      const [country] = key.split('::');
                      return { sku, key, country: country as 'US' | 'UK' };
                    })
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map(({ sku, key, country }) => (
                      <TableRow key={key}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.primary', whiteSpace: 'nowrap' }}>{sku.sku}</TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Input
                            value={sku.productName}
                            onChange={(e) => handleUpdateConfiguredSku(key, { productName: e.target.value })}
                            placeholder="Product name"
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 170 }}>
                          <Input
                            value={sku.asin ? sku.asin : ''}
                            onChange={(e) =>
                              handleUpdateConfiguredSku(
                                key,
                                e.target.value.trim() === '' ? { asin: undefined } : { asin: e.target.value },
                              )
                            }
                            placeholder="ASIN"
                          />
                        </TableCell>
                        <TableCell>
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-flex',
                              height: 24,
                              width: 24,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 99,
                              bgcolor: 'action.hover',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: 'text.secondary',
                            }}
                          >
                            {country}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Select value={sku.brand} onValueChange={(value) => handleUpdateConfiguredSku(key, { brand: value })} placeholder="Select brand..." sx={{ width: 220 }}>
                            {brandsForCountry(country).map((b) => (
                              <SelectItem key={b.name} value={b.name}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveConfiguredSku(key)} aria-label={`Remove SKU ${sku.sku}`}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', fontSize: '0.875rem', color: 'text.secondary' }}>
                      No SKUs configured yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2, py: 2 }}>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { md: '1.2fr 2fr 1.2fr 1.2fr auto' }, alignItems: { md: 'end' } }}>
              <Box>
                <Box sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mb: 0.5 }}>SKU</Box>
                <Input
                  value={manualSku.sku}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="e.g. CSTDS001002"
                />
              </Box>
              <Box>
                <Box sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mb: 0.5 }}>Product name</Box>
                <Input
                  value={manualSku.productName}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, productName: e.target.value }))}
                  placeholder="Optional"
                />
              </Box>
              <Box>
                <Box sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mb: 0.5 }}>ASIN</Box>
                <Input
                  value={manualSku.asin}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, asin: e.target.value }))}
                  placeholder="Optional"
                />
              </Box>
              <Box>
                <Box sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mb: 0.5 }}>Brand</Box>
                <Select value={manualSku.brand} onValueChange={(value) => setManualSku((prev) => ({ ...prev, brand: value }))} placeholder="Select brand...">
                  {supportedBrands.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </Select>
              </Box>
              <Button onClick={handleAddManualSku} disabled={manualSku.sku.trim() === '' || manualSku.brand.trim() === ''}>
                Add SKU
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {draftSkus.length} configured SKU{draftSkus.length !== 1 ? 's' : ''}
        </Typography>
        <Button onClick={handleSave}>
          Save SKUs
        </Button>
      </Box>
    </Box>
  );
}

// Status Bar
function StatusBar({ brands, mappedAccounts, totalAccounts, skus }: { brands: number; mappedAccounts: number; totalAccounts: number; skus: number }) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover', px: 3, py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.875rem' }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: brands > 0 ? '#16a34a' : 'text.secondary' }}>
          <Box component="span" sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: brands > 0 ? '#22c55e' : 'text.disabled' }} />
          {brands} brand{brands !== 1 ? 's' : ''}
        </Box>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: mappedAccounts === totalAccounts ? '#16a34a' : mappedAccounts > 0 ? '#d97706' : 'text.secondary' }}>
          <Box component="span" sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: mappedAccounts === totalAccounts ? '#22c55e' : mappedAccounts > 0 ? '#f59e0b' : 'text.disabled' }} />
          {mappedAccounts}/{totalAccounts} accounts
        </Box>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: skus > 0 ? '#16a34a' : 'text.secondary' }}>
          <Box component="span" sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: skus > 0 ? '#22c55e' : 'text.disabled' }} />
          {skus} SKU{skus !== 1 ? 's' : ''}
        </Box>
      </Box>
    </Box>
  );
}

// Main
export default function SetupPage() {
  const queryClient = useQueryClient();

  const [state, setState] = useState<SetupState>({
    section: 'brands',
    brands: [],
    accountMappings: {},
    accountsCreated: false,
    skus: [],
  });

  // Fetch setup data from API
  const { data: setupData, isLoading: isLoadingSetup } = useQuery({
    queryKey: ['setup'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/setup`);
      if (!res.ok) throw new Error('Failed to fetch setup');
      return res.json() as Promise<{
        brands: Array<{ id: string; name: string; marketplace: string; currency: string }>;
        skus: Array<{ id: string; sku: string; productName: string | null; brand: string; asin: string | null }>;
        accountMappings: Record<string, string | null>;
        accountsCreated: boolean;
      }>;
    },
    staleTime: 30 * 1000,
  });

  // Initialize state from API data
  useEffect(() => {
    if (setupData) {
      setState((prev) => ({
        ...prev,
        brands: setupData.brands.map((b) => ({ name: b.name, marketplace: b.marketplace, currency: b.currency })),
        skus: setupData.skus.map((s) => ({
          sku: s.sku,
          productName: s.productName ? s.productName : '',
          brand: s.brand,
          asin: s.asin ? s.asin : undefined,
        })),
        accountMappings: Object.fromEntries(Object.entries(setupData.accountMappings).filter(([, v]) => v != null)) as Record<string, string>,
        accountsCreated: setupData.accountsCreated,
      }));
    } else {
      // Fall back to localStorage if API returns nothing
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setState((prev) => ({ ...prev, ...parsed }));
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [setupData]);

  // Mutations for saving data
  const saveBrandsMutation = useMutation({
    mutationFn: async (brands: Brand[]) => {
      const res = await fetch(`${basePath}/api/setup/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands }),
      });
      if (!res.ok) throw new Error('Failed to save brands');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  const saveSkusMutation = useMutation({
    mutationFn: async (skus: Sku[]) => {
      const res = await fetch(`${basePath}/api/setup/skus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus }),
      });
      if (!res.ok) throw new Error('Failed to save SKUs');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  const saveAccountsMutation = useMutation({
    mutationFn: async (data: { accountMappings: Record<string, string>; accountsCreated?: boolean }) => {
      const res = await fetch(`${basePath}/api/setup/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save accounts');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  // Save state (local + API)
  const saveState = useCallback((patch: Partial<SetupState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      // Save to localStorage as backup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Save brands to API when they change
  const saveBrands = useCallback((brands: Brand[]) => {
    saveState({ brands, accountsCreated: false });
    saveBrandsMutation.mutate(brands);
  }, [saveState, saveBrandsMutation]);

  // Save SKUs to API when they change
  const saveSkus = useCallback((skus: Sku[]) => {
    saveState({ skus });
    saveSkusMutation.mutate(skus);
  }, [saveState, saveSkusMutation]);

  // Save account mappings to API
  const saveAccountMappings = useCallback((accountMappings: Record<string, string>) => {
    saveState({ accountMappings });
    saveAccountsMutation.mutate({ accountMappings });
  }, [saveState, saveAccountsMutation]);

  // Mark accounts as created
  const markAccountsCreated = useCallback(() => {
    saveState({ accountsCreated: true });
    saveAccountsMutation.mutate({ accountMappings: state.accountMappings, accountsCreated: true });
  }, [saveState, saveAccountsMutation, state.accountMappings]);

  // Check QBO connection
  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/qbo/status`);
      return res.json() as Promise<{ connected: boolean }>;
    },
    staleTime: 30 * 1000,
  });

  // Fetch QBO accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['qbo-accounts'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/qbo/accounts`);
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json() as Promise<{ accounts: QboAccount[] }>;
    },
    enabled: connectionStatus?.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const accounts = useMemo(() => (accountsData ? accountsData.accounts : []), [accountsData]);
  const mappedCount = ALL_ACCOUNTS.filter((a) => state.accountMappings[a.key]).length;

  // Show loading while checking connection or loading setup
  if (isCheckingConnection || isLoadingSetup) {
    return (
      <Box component="main" sx={{ flex: 1 }}>
        <Box sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
          <PageHeader
            title="Accounts & Taxes Setup Wizard"
            variant="accent"
          />
          <Box sx={{ mt: 3 }}>
            <Card sx={{ border: 1, borderColor: 'divider' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Loading setup...</Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Accounts & Taxes Setup Wizard"
          variant="accent"
        />

        {connectionStatus?.connected !== true && (
          <Card sx={{ mt: 3, border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box
                  sx={{
                    mt: 0.25,
                    display: 'flex',
                    height: 32,
                    width: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    color: 'text.secondary',
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Not connected to QuickBooks</Box>
                  <Box sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                    You can still add brands and inventory. Connect QBO to map accounts and use dashboards.
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        <Card sx={{ mt: 3, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
              <Sidebar
                section={state.section}
                onSectionChange={(s) => saveState({ section: s })}
                brandsComplete={state.brands.length > 0}
                accountsComplete={state.accountsCreated && mappedCount === ALL_ACCOUNTS.length}
                skusComplete={state.skus.length > 0}
              />

              <Box sx={{ flex: 1, p: 3 }}>
                <Box sx={{ maxWidth: 896 }}>
                  {state.section === 'brands' && <BrandsSection brands={state.brands} onBrandsChange={saveBrands} />}
                  {state.section === 'accounts' && (
                    <AccountsSection
                      isQboConnected={connectionStatus?.connected === true}
                      accounts={accounts}
                      accountMappings={state.accountMappings}
                      onAccountMappingsChange={saveAccountMappings}
                      brands={state.brands}
                      onAccountsCreated={markAccountsCreated}
                      accountsCreated={state.accountsCreated}
                      isLoadingAccounts={isLoadingAccounts}
                    />
                  )}
                  {state.section === 'skus' && <SkusSection skus={state.skus} onSkusChange={saveSkus} brands={state.brands} />}
                </Box>
              </Box>
            </Box>
          </CardContent>

          <StatusBar
            brands={state.brands.length}
            mappedAccounts={mappedCount}
            totalAccounts={ALL_ACCOUNTS.length}
            skus={state.skus.length}
          />
        </Card>
      </Box>
    </Box>
  );
}
