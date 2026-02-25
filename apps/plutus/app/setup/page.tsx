'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { PageHeader } from '@/components/page-header';
import { PLUTUS_BRAND_ACCOUNT_PREFIXES } from '@/lib/plutus/default-accounts';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

const STORAGE_KEY = 'plutus-setup-v6'; // Bump when wizard sections change

const MARKETPLACES = [
  { id: 'amazon.com', label: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', label: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', label: 'Amazon.de', currency: 'EUR' },
  { id: 'amazon.fr', label: 'Amazon.fr', currency: 'EUR' },
  { id: 'amazon.es', label: 'Amazon.es', currency: 'EUR' },
  { id: 'amazon.it', label: 'Amazon.it', currency: 'EUR' },
] as const;

const MARKETPLACE_COUNTRY: Record<string, 'US' | 'UK'> = {
  'amazon.com': 'US',
  'amazon.co.uk': 'UK',
};

type Brand ={ name: string; marketplace: string; currency: string };
type Sku = { sku: string; productName: string; brand: string; asin?: string };

type SetupState = {
  section: 'brands' | 'accounts' | 'settlement';
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

type SettlementMappingResponse = {
  usSettlementBankAccountId: string | null;
  usSettlementPaymentAccountId: string | null;
  usSettlementAccountIdByMemo: Record<string, string>;
  usSettlementTaxCodeIdByMemo: Record<string, string | null>;
  ukSettlementBankAccountId: string | null;
  ukSettlementPaymentAccountId: string | null;
  ukSettlementAccountIdByMemo: Record<string, string>;
  ukSettlementTaxCodeIdByMemo: Record<string, string | null>;
};

type ConnectionStatus = {
  connected: boolean;
  usingSalesTax?: boolean;
  partnerTaxEnabled?: boolean;
};

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function accountDepth(account: QboAccount): number {
  return account.fullyQualifiedName.split(':').length - 1;
}

function leafAccountName(account: QboAccount): string {
  const parts = account.fullyQualifiedName.split(':');
  const leaf = parts[parts.length - 1]!;
  return leaf.trim();
}

function qboAccountLabel(accounts: QboAccount[], accountId: string | null): string | null {
  if (accountId === null) return null;
  const found = accounts.find((a) => a.id === accountId);
  if (!found) return accountId;
  return found.acctNum ? `${found.acctNum} · ${found.fullyQualifiedName}` : found.fullyQualifiedName;
}

function parentFullyQualifiedName(account: QboAccount): string | null {
  const parts = account.fullyQualifiedName.split(':');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(':');
}

function isPlutusBrandLeafAccount(account: QboAccount, brandNames: string[]): boolean {
  const leaf = leafAccountName(account);

  for (const prefix of PLUTUS_BRAND_ACCOUNT_PREFIXES) {
    if (leaf.startsWith(prefix)) return true;
  }

  if (accountDepth(account) > 0 && brandNames.includes(leaf)) {
    return true;
  }

  return false;
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

const AMAZON_REVENUE_FEE_ACCOUNTS = [
  { key: 'amazonSales', label: 'Amazon Sales', type: 'Income' },
  { key: 'amazonRefunds', label: 'Amazon Refunds', type: 'Income' },
  { key: 'amazonFbaInventoryReimbursement', label: 'FBA Reimbursement', type: 'Other Income' },
  { key: 'amazonSellerFees', label: 'Seller Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonFbaFees', label: 'FBA Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonStorageFees', label: 'Storage Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonAdvertisingCosts', label: 'Advertising', type: 'Cost of Goods Sold' },
  { key: 'amazonPromotions', label: 'Promotions', type: 'Cost of Goods Sold' },
];

const ALL_ACCOUNTS = [
  ...INVENTORY_ACCOUNTS,
  ...COGS_ACCOUNTS,
  ...WAREHOUSING_ACCOUNTS,
  ...PRODUCT_EXPENSES_ACCOUNTS,
  ...AMAZON_REVENUE_FEE_ACCOUNTS,
];

// Sidebar
function Sidebar({
  section,
  onSectionChange,
  catalogComplete,
  accountsComplete,
  settlementComplete,
}: {
  section: string;
  onSectionChange: (s: 'brands' | 'accounts' | 'settlement') => void;
  catalogComplete: boolean;
  accountsComplete: boolean;
  settlementComplete: boolean;
}) {
  const items = [
    { id: 'brands' as const, label: 'Brands & SKUs', complete: catalogComplete },
    { id: 'accounts' as const, label: 'Chart of accounts', complete: accountsComplete },
    { id: 'settlement' as const, label: 'Settlement posting', complete: settlementComplete },
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
                      ? { bgcolor: 'background.paper', borderColor: '#00C2B9', color: '#00C2B9' }
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

// Brands & SKUs Section (combined)
function BrandsInventorySection({
  brands,
  skus,
  onBrandsChange,
  onSkusChange,
}: {
  brands: Brand[];
  skus: Sku[];
  onBrandsChange: (brands: Brand[]) => void;
  onSkusChange: (skus: Sku[]) => void;
}) {
  const normalizeSkuKey = useCallback(
    (raw: string) => raw.trim().replace(/\s+/g, '-').toUpperCase(),
    [],
  );

  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(() => new Set<string>());
  const [draftSkus, setDraftSkus] = useState<Sku[]>(skus);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandMarketplace, setNewBrandMarketplace] = useState('amazon.com');
  const [newSkuForms, setNewSkuForms] = useState<Record<string, { sku: string; productName: string; asin: string }>>({});

  useEffect(() => {
    setDraftSkus(skus);
  }, [skus]);

  const toggleBrand = useCallback((name: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleAddBrand = useCallback(() => {
    const name = newBrandName.trim();
    if (!name || brands.some((b) => b.name === name)) return;
    const mp = MARKETPLACES.find((m) => m.id === newBrandMarketplace);
    if (!mp) return;
    onBrandsChange([...brands, { name, marketplace: mp.id, currency: mp.currency }]);
    setNewBrandName('');
    setExpandedBrands((prev) => new Set([...prev, name]));
  }, [brands, newBrandMarketplace, newBrandName, onBrandsChange]);

  const handleRemoveBrand = useCallback(
    (name: string) => {
      onBrandsChange(brands.filter((b) => b.name !== name));
      setDraftSkus((prev) => prev.filter((s) => s.brand !== name));
    },
    [brands, onBrandsChange],
  );

  const skusForBrand = useCallback(
    (brandName: string) => draftSkus.filter((s) => s.brand === brandName),
    [draftSkus],
  );

  const handleUpdateSku = useCallback(
    (brandName: string, skuId: string, patch: Partial<Sku>) => {
      setDraftSkus((prev) =>
        prev.map((s) => (s.brand === brandName && s.sku === skuId ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  const handleRemoveSku = useCallback(
    (brandName: string, skuId: string) => {
      const next = draftSkus.filter((s) => !(s.brand === brandName && s.sku === skuId));
      setDraftSkus(next);
      onSkusChange(next);
    },
    [draftSkus, onSkusChange],
  );

  const handleAddSku = useCallback(
    (brandName: string) => {
      const form = newSkuForms[brandName] ?? { sku: '', productName: '', asin: '' };
      const skuRaw = form.sku.trim();
      if (skuRaw === '') return;
      const brand = brands.find((b) => b.name === brandName);
      if (!brand) return;
      const country = MARKETPLACE_COUNTRY[brand.marketplace];
      if (!country) return;
      const normalizedKey = `${country}::${normalizeSkuKey(skuRaw)}`;
      const isDuplicate = draftSkus.some((s) => {
        const b = brands.find((b2) => b2.name === s.brand);
        if (!b) return false;
        const c = MARKETPLACE_COUNTRY[b.marketplace];
        return `${c}::${normalizeSkuKey(s.sku)}` === normalizedKey;
      });
      if (isDuplicate) return;
      const productName = form.productName.trim() !== '' ? form.productName.trim() : skuRaw;
      const asin = form.asin.trim() !== '' ? form.asin.trim() : undefined;
      const next = [...draftSkus, { sku: skuRaw, productName, asin, brand: brandName }];
      setDraftSkus(next);
      onSkusChange(next);
      setNewSkuForms((prev) => ({ ...prev, [brandName]: { sku: '', productName: '', asin: '' } }));
    },
    [brands, draftSkus, newSkuForms, normalizeSkuKey, onSkusChange],
  );

  const handleSaveSkus = useCallback(() => {
    onSkusChange(draftSkus);
  }, [draftSkus, onSkusChange]);

  const isDirty = useMemo(() => {
    if (draftSkus.length !== skus.length) return true;
    return draftSkus.some((ds, i) => {
      const s = skus[i];
      return !s || ds.productName !== s.productName || ds.asin !== s.asin || ds.sku !== s.sku || ds.brand !== s.brand;
    });
  }, [draftSkus, skus]);

  const thSx = {
    height: 36,
    px: 1.5,
    fontSize: '0.75rem' as const,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'text.secondary',
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '8px',
      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9' },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
    },
  };

  const inputSlotProps = { input: { sx: { fontSize: '0.875rem', height: 32 } } };

  const selectSx = {
    borderRadius: '8px',
    fontSize: '0.875rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
  };

  const menuProps = {
    PaperProps: {
      sx: {
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
        mt: 0.5,
      },
    },
  };

  const btnSx = {
    borderRadius: '8px',
    textTransform: 'none' as const,
    fontWeight: 500,
    height: 36,
    px: 2,
    fontSize: '0.875rem',
    bgcolor: '#00C2B9',
    color: '#fff',
    '&:hover': { bgcolor: '#00a89f' },
    '&:active': { bgcolor: '#008f87' },
    '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' as const },
    whiteSpace: 'nowrap' as const,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>
        Brands & SKUs
      </Typography>

      <Card sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ width: '100%', fontSize: '0.875rem' }}>
              <TableHead
                sx={{
                  bgcolor: 'rgba(245, 245, 245, 0.8)',
                  '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                  '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
                }}
              >
                <TableRow sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <TableCell component="th" sx={{ ...thSx, width: 40, p: 0 }} />
                  <TableCell component="th" sx={thSx}>Brand / SKU</TableCell>
                  <TableCell component="th" sx={thSx}>Marketplace / Product Name</TableCell>
                  <TableCell component="th" sx={thSx}>Currency / ASIN</TableCell>
                  <TableCell component="th" sx={{ ...thSx, width: 48, textAlign: 'right' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {brands.map((brand) => {
                  const expanded = expandedBrands.has(brand.name);
                  const brandSkus = skusForBrand(brand.name);
                  const newSkuForm = newSkuForms[brand.name] ?? { sku: '', productName: '', asin: '' };

                  return (
                    <Fragment key={brand.name}>
                      {/* Brand row */}
                      <TableRow
                        sx={{
                          borderBottom: 1,
                          borderColor: 'divider',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                        onClick={() => toggleBrand(brand.name)}
                      >
                        <TableCell sx={{ p: 0, pl: 0.5, width: 40 }}>
                          <IconButton size="small" tabIndex={-1} sx={{ color: 'text.secondary', pointerEvents: 'none' }}>
                            {expanded
                              ? <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                              : <KeyboardArrowRightIcon sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ px: 1.5, py: 1, color: 'text.primary', fontSize: '0.875rem', fontWeight: 600 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {brand.name}
                            <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.disabled', fontWeight: 400 }}>
                              {brandSkus.length} SKU{brandSkus.length !== 1 ? 's' : ''}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ px: 1.5, py: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                          {MARKETPLACES.find((m) => m.id === brand.marketplace)?.label}
                        </TableCell>
                        <TableCell sx={{ px: 1.5, py: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                          {brand.currency}
                        </TableCell>
                        <TableCell
                          sx={{ px: 1.5, py: 0.5, textAlign: 'right' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconButton
                            onClick={() => handleRemoveBrand(brand.name)}
                            size="small"
                            aria-label={`Remove brand ${brand.name}`}
                            sx={{ color: 'text.secondary', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
                          >
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>

                      {/* SKU sub-rows */}
                      {expanded && brandSkus.map((sku) => (
                        <TableRow
                          key={`sku-${sku.sku}`}
                          sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            bgcolor: 'rgba(245, 245, 245, 0.5)',
                            '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.02)' },
                            transition: 'background-color 0.15s',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <TableCell sx={{ p: 0, width: 40 }} />
                          <TableCell sx={{ pl: 3.5, pr: 1.5, py: 0.75, color: 'text.primary', fontFamily: 'monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                            {sku.sku}
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, minWidth: 220 }}>
                            <TextField
                              value={sku.productName}
                              onChange={(e) => handleUpdateSku(brand.name, sku.sku, { productName: e.target.value })}
                              placeholder="Product name"
                              size="small"
                              variant="outlined"
                              fullWidth
                              slotProps={inputSlotProps}
                              sx={inputSx}
                            />
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, minWidth: 170 }}>
                            <TextField
                              value={sku.asin ?? ''}
                              onChange={(e) =>
                                handleUpdateSku(
                                  brand.name,
                                  sku.sku,
                                  e.target.value.trim() === '' ? { asin: undefined } : { asin: e.target.value },
                                )
                              }
                              placeholder="ASIN"
                              size="small"
                              variant="outlined"
                              fullWidth
                              slotProps={inputSlotProps}
                              sx={inputSx}
                            />
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, textAlign: 'right' }}>
                            <IconButton
                              onClick={() => handleRemoveSku(brand.name, sku.sku)}
                              size="small"
                              aria-label={`Remove SKU ${sku.sku}`}
                              sx={{ color: 'text.secondary', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
                            >
                              <CloseIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Add SKU row (shown when brand is expanded) */}
                      {expanded && (
                        <TableRow
                          key={`add-sku-${brand.name}`}
                          sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            bgcolor: 'rgba(0, 194, 185, 0.03)',
                          }}
                        >
                          <TableCell sx={{ p: 0, width: 40 }} />
                          <TableCell sx={{ pl: 3.5, pr: 1.5, py: 0.75, minWidth: 140 }}>
                            <TextField
                              value={newSkuForm.sku}
                              onChange={(e) =>
                                setNewSkuForms((prev) => ({
                                  ...prev,
                                  [brand.name]: { ...newSkuForm, sku: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSku(brand.name); }}
                              placeholder="New SKU"
                              size="small"
                              variant="outlined"
                              fullWidth
                              slotProps={inputSlotProps}
                              sx={inputSx}
                            />
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, minWidth: 220 }}>
                            <TextField
                              value={newSkuForm.productName}
                              onChange={(e) =>
                                setNewSkuForms((prev) => ({
                                  ...prev,
                                  [brand.name]: { ...newSkuForm, productName: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSku(brand.name); }}
                              placeholder="Product name (optional)"
                              size="small"
                              variant="outlined"
                              fullWidth
                              slotProps={inputSlotProps}
                              sx={inputSx}
                            />
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, minWidth: 170 }}>
                            <TextField
                              value={newSkuForm.asin}
                              onChange={(e) =>
                                setNewSkuForms((prev) => ({
                                  ...prev,
                                  [brand.name]: { ...newSkuForm, asin: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSku(brand.name); }}
                              placeholder="ASIN (optional)"
                              size="small"
                              variant="outlined"
                              fullWidth
                              slotProps={inputSlotProps}
                              sx={inputSx}
                            />
                          </TableCell>
                          <TableCell sx={{ px: 1.5, py: 0.75, textAlign: 'right' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleAddSku(brand.name)}
                              disabled={newSkuForm.sku.trim() === ''}
                              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                              sx={{
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 500,
                                height: 32,
                                px: 1.5,
                                fontSize: '0.8125rem',
                                borderColor: '#00C2B9',
                                color: '#00C2B9',
                                '&:hover': { borderColor: '#00a89f', bgcolor: 'rgba(0,194,185,0.04)' },
                                '&.Mui-disabled': { opacity: 0.4 },
                                whiteSpace: 'nowrap',
                                '& .MuiButton-startIcon, & .MuiButton-endIcon': { '& > *': { fontSize: 14 } },
                              }}
                            >
                              Add SKU
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}

                {/* Add Brand row */}
                <TableRow
                  sx={{
                    bgcolor: 'rgba(245, 245, 245, 0.5)',
                    '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.02)' },
                  }}
                >
                  <TableCell sx={{ p: 0, width: 40 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', pt: 0.5 }}>
                      <AddIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ px: 1.5, py: 1 }}>
                    <TextField
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddBrand(); }}
                      placeholder="Brand name"
                      size="small"
                      variant="outlined"
                      fullWidth
                      slotProps={inputSlotProps}
                      sx={inputSx}
                    />
                  </TableCell>
                  <TableCell sx={{ px: 1.5, py: 1 }}>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={newBrandMarketplace}
                        onChange={(e) => setNewBrandMarketplace(e.target.value as string)}
                        sx={selectSx}
                        MenuProps={menuProps}
                      >
                        {MARKETPLACES.map((m) => (
                          <MenuItem key={m.id} value={m.id} sx={{ borderRadius: 2, mx: 0.5, fontSize: '0.875rem' }}>
                            {m.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ px: 1.5, py: 1 }}>
                    <Box sx={{ fontSize: '0.875rem', color: 'text.disabled', height: 32, display: 'flex', alignItems: 'center' }}>
                      {MARKETPLACES.find((m) => m.id === newBrandMarketplace)?.currency ?? ''}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ px: 1.5, py: 1, textAlign: 'right' }}>
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={handleAddBrand}
                      disabled={!newBrandName.trim()}
                      sx={btnSx}
                    >
                      Add Brand
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {isDirty && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            Unsaved changes to product names or ASINs
          </Typography>
          <Button variant="contained" disableElevation onClick={handleSaveSkus} sx={btnSx}>
            Save changes
          </Button>
        </Box>
      )}
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
  brandNames,
}: {
  label: string;
  accountId: string;
  accounts: QboAccount[];
  onChange: (id: string) => void;
  type?: string;
  brandNames: string[];
}) {
  const selected = accounts.find((a) => a.id === accountId);
  const selectedIsBrandLeaf = selected ? isPlutusBrandLeafAccount(selected, brandNames) : false;
  const selectedParentPath = selected ? parentFullyQualifiedName(selected) : null;
  const selectedParent =
    selectedIsBrandLeaf && selectedParentPath ? accounts.find((a) => a.fullyQualifiedName === selectedParentPath) : undefined;

  const filtered = (type ? accounts.filter((a) => a.type === type) : accounts).filter(
    (account) => !isPlutusBrandLeafAccount(account, brandNames),
  );

  return (
    <TableRow sx={{ borderBottom: 1, borderColor: 'divider', transition: 'background-color 0.15s', '&:hover': { bgcolor: 'action.hover' } }}>
      <TableCell sx={{ px: 1.5, py: 0.75, color: 'text.primary', fontVariantNumeric: 'tabular-nums', fontSize: '0.875rem', fontWeight: 500 }}>
        {label}
      </TableCell>
      <TableCell sx={{ px: 1.5, py: 0.75, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        <FormControl size="small" fullWidth error={selectedIsBrandLeaf}>
          <Select
            value={accountId}
            onChange={(e) => onChange(e.target.value as string)}
            displayEmpty
            renderValue={(sel) => {
              if (!sel) return <span style={{ color: '#94a3b8' }}>Select parent account...</span>;
              const account = accounts.find((a) => a.id === sel);
              if (!account) return sel as string;
              return account.acctNum ? `${account.acctNum} · ${account.fullyQualifiedName}` : account.fullyQualifiedName;
            }}
            sx={{
              borderRadius: '8px',
              fontSize: '0.875rem',
              height: 32,
              bgcolor: 'background.paper',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: selected ? '#00C2B9' : 'divider',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  borderRadius: 3,
                  border: 1,
                  borderColor: 'divider',
                  boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
                  mt: 0.5,
                },
              },
            }}
          >
            {filtered.map((a) => {
              const label = a.acctNum ? `${a.acctNum} \u00B7 ${a.fullyQualifiedName}` : a.fullyQualifiedName;
              return (
                <MenuItem key={a.id} value={a.id} sx={{ borderRadius: 2, mx: 0.5, fontSize: '0.875rem' }}>
                  {label}
                </MenuItem>
              );
            })}
          </Select>
          {selectedIsBrandLeaf && (
            <FormHelperText sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>
                Selected account is a brand sub-account. Choose the parent account instead
                {selectedParentPath ? ` (e.g. ${selectedParentPath})` : ''}.
              </span>
              {selectedParent && (
                <Button variant="text" size="small" onClick={() => onChange(selectedParent.id)} sx={{ p: 0, minWidth: 0 }}>
                  Use parent
                </Button>
              )}
            </FormHelperText>
          )}
        </FormControl>
      </TableCell>
      <TableCell sx={{ px: 1.5, py: 0.75, color: 'text.primary', fontVariantNumeric: 'tabular-nums', width: 48, textAlign: 'right' }}>
        {selected &&
          (selectedIsBrandLeaf ? (
            <CloseIcon sx={{ fontSize: 16, color: 'error.main' }} />
          ) : (
            <CheckIcon sx={{ fontSize: 16, color: '#22c55e' }} />
          ))}
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
  const [lastEnsureSummary, setLastEnsureSummary] = useState<{ created: number; renamed: number; skipped: number } | null>(null);
  const brandNames = useMemo(() => brands.map((b) => b.name), [brands]);

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
      const res = await fetch(`${basePath}/api/qbo/accounts/create-plutus-qbo-plan`, {
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

      if (!Array.isArray(data.created) || !Array.isArray(data.renamed) || !Array.isArray(data.skipped)) {
        throw new Error('Unexpected response from account creation endpoint');
      }

      setLastEnsureSummary({ created: data.created.length, renamed: data.renamed.length, skipped: data.skipped.length });
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
          <CardContent sx={{ p: 3, textAlign: 'center', '&:last-child': { pb: 3 } }}>
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
                variant="contained"
                disableElevation
                onClick={handleConnect}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  bgcolor: '#00C2B9',
                  color: '#fff',
                  '&:hover': { bgcolor: '#00a89f' },
                  boxShadow: '0 4px 14px -3px rgba(0,194,185,0.25)',
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
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
            py: 1,
          }}
        >
          <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{title}</Box>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table sx={{ width: '100%', fontSize: '0.875rem' }}>
            <TableHead
              sx={{
                bgcolor: 'rgba(245, 245, 245, 0.8)',
                '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
              }}
            >
              <TableRow
                sx={{ borderBottom: 1, borderColor: 'divider', transition: 'background-color 0.15s', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <TableCell
                  component="th"
                  sx={{
                    height: 36,
                    px: 1.5,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'text.secondary',
                  }}
                >
                  Category
                </TableCell>
                <TableCell
                  component="th"
                  sx={{
                    height: 36,
                    px: 1.5,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'text.secondary',
                  }}
                >
                  QBO parent account
                </TableCell>
                <TableCell
                  component="th"
                  sx={{
                    height: 36,
                    px: 1.5,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'text.secondary',
                    width: 48,
                    textAlign: 'right',
                  }}
                >
                  {' '}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody sx={{ '& .MuiTableRow-root:last-child': { borderBottom: 0 } }}>
              {accountList.map((acc) => (
                <AccountRow
                  key={acc.key}
                  label={acc.label}
                  accountId={accountMappings[acc.key] ? accountMappings[acc.key] : ''}
                  accounts={accounts}
                  onChange={(id) => updateAccount(acc.key, id)}
                  type={acc.type}
                  brandNames={brandNames}
                />
              ))}
            </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    );

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>Account Mapping</Typography>
          <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
            Plutus uses these parent accounts to create brand sub-accounts (e.g. <strong>Manufacturing - US-PDS</strong>).
            Select parent accounts only. Brand sub-accounts are hidden to prevent accidental mis-mapping.
          </Typography>
        </Box>

        <Card sx={{ border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
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
                <Box sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>What this step controls</Box>
                <Box sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                  <Box component="ul" sx={{ m: 0, pl: 2, '& > li': { mb: 0.5 } }}>
                    <li><strong>Inventory Asset</strong> is balance sheet (capitalized costs).</li>
                    <li><strong>COGS / Warehousing / Amazon Fees</strong> are P&amp;L (reclass when processed).</li>
                    <li><strong>Reserve / rollovers / sales tax</strong> are configured in <strong>Settlement posting</strong>.</li>
                  </Box>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>

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
                    ? `Created ${lastEnsureSummary.created}, renamed ${lastEnsureSummary.renamed}, skipped ${lastEnsureSummary.skipped}.`
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
          {renderAccountGroup('Amazon Revenue & Fees', AMAZON_REVENUE_FEE_ACCOUNTS)}
        </Box>

        {error && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'rgba(239,68,68,0.05)',
              border: 1,
              borderColor: 'rgba(239,68,68,0.2)',
            }}
          >
            <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>{error}</Typography>
          </Box>
        )}

        <Button
          variant="contained"
          disableElevation
          onClick={createAccounts}
          disabled={!allMapped || creating}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 500,
            gap: 1,
            whiteSpace: 'nowrap',
            '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { '& > *': { fontSize: 16 } },
            height: 36,
            px: 2,
            fontSize: '0.875rem',
            bgcolor: '#00C2B9',
            color: '#fff',
            '&:hover': { bgcolor: '#00a89f' },
            '&:active': { bgcolor: '#008f87' },
            width: '100%',
          }}
        >
          {creating ? 'Ensuring...' : `Ensure Sub-Accounts for ${brands.length} Brand${brands.length > 1 ? 's' : ''}`}
        </Button>
      </Box>
  );
}

function SettlementSection({
  isQboConnected,
  isLoadingAccounts,
  accounts,
  mapping,
  isLoadingMapping,
  brands,
  taxEngineEnabled,
}: {
  isQboConnected: boolean;
  isLoadingAccounts: boolean;
  accounts: QboAccount[];
  mapping: SettlementMappingResponse | undefined;
  isLoadingMapping: boolean;
  brands: Brand[];
  taxEngineEnabled: boolean;
}) {
  const hasUs = brands.some((b) => b.marketplace === 'amazon.com');
  const hasUk = brands.some((b) => b.marketplace === 'amazon.co.uk');

  const reservedMemos = [
    'Amazon Reserved Balances - Current Reserve Amount',
    'Amazon Reserved Balances - Previous Reserve Amount Balance',
    'Amazon Reserved Balances - Successful charge',
    'Amazon Reserved Balances - Repayment of negative Amazon balance',
  ];

  const splitMonthMemos = [
    'Split month settlement - balance of this invoice rolled forward',
    'Split month settlement - balance of previous invoice(s) rolled forward',
  ];

  const salesTaxMemos = [
    'Amazon Sales Tax - Sales Tax (Principal)',
    'Amazon Sales Tax - Marketplace Facilitator Tax - (Principal)',
    'Amazon Sales Tax - Sales Tax (Shipping)',
    'Amazon Sales Tax - Marketplace Facilitator Tax - (Shipping)',
    'Amazon Sales Tax - Refund - Item Price - Tax',
    'Amazon Sales Tax - Refunded Marketplace Facilitator Tax - (Principal)',
    'Amazon Sales Tax - Refunded Marketplace Facilitator Tax - (Shipping)',
  ];

  const handleOpenSettlementMapping = () => {
    window.location.href = `${basePath}/settlement-mapping`;
  };

  if (brands.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>Add brands first before configuring settlement posting.</Typography>
      </Box>
    );
  }

  if (!isQboConnected) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
        <Card sx={{ maxWidth: 520, width: '100%', border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3, textAlign: 'center', '&:last-child': { pb: 3 } }}>
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
              <InfoOutlinedIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box sx={{ mt: 2, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Connect QuickBooks to view settlement accounts</Box>
            <Box sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
              Plutus posts Amazon settlements as journal entries and needs QBO accounts selected.
            </Box>
            <Box sx={{ mt: 2.5 }}>
              <Button
                variant="contained"
                disableElevation
                onClick={() => {
                  window.location.href = `${basePath}/api/qbo/connect`;
                }}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  bgcolor: '#00C2B9',
                  color: '#fff',
                  '&:hover': { bgcolor: '#00a89f' },
                  boxShadow: '0 4px 14px -3px rgba(0,194,185,0.25)',
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

  if (isLoadingAccounts || isLoadingMapping) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ color: 'text.secondary' }}>Loading settlement mapping...</Typography>
      </Box>
    );
  }

  const renderRegion = (input: {
    title: string;
    bankAccountId: string | null;
    paymentAccountId: string | null;
    memoMappings: Record<string, string>;
  }) => {
    const memoCount = Object.keys(input.memoMappings).length;

    const memoAccountIds = (memos: string[]): string[] => {
      const ids = new Set<string>();
      for (const memo of memos) {
        const id = input.memoMappings[memo];
        if (typeof id === 'string' && id.trim() !== '') {
          ids.add(id.trim());
        }
      }
      return Array.from(ids).sort();
    };

    const rowValue = (label: string, ids: string[], missingCount: number): { value: string; ok: boolean } => {
      if (ids.length === 1 && missingCount === 0) {
        const accountLabel = qboAccountLabel(accounts, ids[0] ? ids[0] : null);
        return { value: accountLabel ? accountLabel : ids[0]!, ok: true };
      }
      if (ids.length === 0) {
        return { value: missingCount > 0 ? `Not set (${missingCount} memo${missingCount === 1 ? '' : 's'})` : 'Not set', ok: false };
      }
      return { value: `Multiple accounts (${label})`, ok: false };
    };

    const reservedIds = memoAccountIds(reservedMemos);
    const reservedMissing = reservedMemos.filter((memo) => !input.memoMappings[memo]).length;
    const splitIds = memoAccountIds(splitMonthMemos);
    const splitMissing = splitMonthMemos.filter((memo) => !input.memoMappings[memo]).length;
    const taxIds = memoAccountIds(salesTaxMemos);
    const taxMissing = salesTaxMemos.filter((memo) => !input.memoMappings[memo]).length;

    const bankLabel = qboAccountLabel(accounts, input.bankAccountId);
    const paymentLabel = qboAccountLabel(accounts, input.paymentAccountId);

    const reservedRow = rowValue('reserved', reservedIds, reservedMissing);
    const splitRow = rowValue('split month', splitIds, splitMissing);
    const taxRow = rowValue('sales tax', taxIds, taxMissing);

    const bankOk = bankLabel !== null && bankLabel.trim() !== '';
    const paymentOk = paymentLabel !== null && paymentLabel.trim() !== '';

    return (
      <Card sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
            <Box sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              {input.title}
            </Box>
            <Box sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>{memoCount} memos mapped</Box>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ width: '100%', fontSize: '0.875rem' }}>
              <TableHead
                sx={{
                  bgcolor: 'rgba(245, 245, 245, 0.8)',
                  '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                  '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
                }}
              >
                <TableRow sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <TableCell component="th" sx={{ height: 36, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                    Category
                  </TableCell>
                  <TableCell component="th" sx={{ height: 36, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                    QBO account
                  </TableCell>
                  <TableCell component="th" sx={{ height: 36, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', width: 48, textAlign: 'right' }}>
                    {' '}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody sx={{ '& .MuiTableRow-root:last-child': { borderBottom: 0 } }}>
                {[
                  { label: 'Transfer to bank', value: bankLabel ?? 'Not set', ok: bankOk },
                  { label: 'Payment to Amazon', value: paymentLabel ?? 'Not set', ok: paymentOk },
                  { label: `Reserved balances (${reservedMemos.length})`, value: reservedRow.value, ok: reservedRow.ok },
                  { label: `Split month rollovers (${splitMonthMemos.length})`, value: splitRow.value, ok: splitRow.ok },
                  { label: `Sales tax memos (${salesTaxMemos.length})`, value: taxRow.value, ok: taxRow.ok },
                ].map((row) => (
                  <TableRow key={row.label} sx={{ borderBottom: 1, borderColor: 'divider', transition: 'background-color 0.15s', '&:hover': { bgcolor: 'action.hover' } }}>
                    <TableCell sx={{ px: 1.5, py: 0.75, color: 'text.primary', fontSize: '0.875rem', fontWeight: 500 }}>
                      {row.label}
                    </TableCell>
                    <TableCell sx={{ px: 1.5, py: 0.75, color: row.ok ? 'text.primary' : 'text.secondary', fontSize: '0.875rem' }}>
                      {row.value}
                    </TableCell>
                    <TableCell sx={{ px: 1.5, py: 0.75, width: 48, textAlign: 'right' }}>
                      {row.ok ? (
                        <CheckIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                      ) : (
                        <CloseIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const usMapping = mapping
    ? {
        title: 'Amazon.com settlement',
        bankAccountId: mapping.usSettlementBankAccountId,
        paymentAccountId: mapping.usSettlementPaymentAccountId,
        memoMappings: mapping.usSettlementAccountIdByMemo,
      }
    : null;

  const ukMapping = mapping
    ? {
        title: 'Amazon.co.uk settlement',
        bankAccountId: mapping.ukSettlementBankAccountId,
        paymentAccountId: mapping.ukSettlementPaymentAccountId,
        memoMappings: mapping.ukSettlementAccountIdByMemo,
      }
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600, color: 'text.primary' }}>Settlement posting</Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
          Plutus posts Amazon settlements as journal entries using a memo-to-account mapping (including balance sheet lines like reserves and split-month rollovers).
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 2 }}>
        <Card sx={{ border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
              Tax behavior
            </Typography>
            {taxEngineEnabled ? (
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                QBO sales tax is enabled. Settlement tax code mapping is available in Full Settlement Mapping and uses tax code names.
              </Typography>
            ) : (
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                QBO sales tax is disabled for this company. Plutus posts net settlement amounts and does not apply TaxCodeRef on settlement journal lines.
              </Typography>
            )}
          </CardContent>
        </Card>

        {hasUs && usMapping && renderRegion(usMapping)}
        {hasUk && ukMapping && renderRegion(ukMapping)}
        {!hasUs && !hasUk && (
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                Settlement mapping is currently shown for Amazon.com and Amazon.co.uk brands.
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>

      <Button
        variant="contained"
        disableElevation
        onClick={handleOpenSettlementMapping}
        sx={{
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 500,
          height: 36,
          px: 2,
          fontSize: '0.875rem',
          bgcolor: '#00C2B9',
          color: '#fff',
          '&:hover': { bgcolor: '#00a89f' },
          '&:active': { bgcolor: '#008f87' },
          width: '100%',
        }}
      >
        Open full Settlement Mapping
      </Button>
    </Box>
  );
}

// Status Bar
function StatusBar({ brands, mappedAccounts, totalAccounts, skus }: { brands: number; mappedAccounts: number; totalAccounts: number; skus: number }) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover', px: 3, py: 1 }}>
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
      return res.json() as Promise<ConnectionStatus>;
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

  const { data: settlementMappingData, isLoading: isLoadingSettlementMapping } = useQuery({
    queryKey: ['setup-settlement-mapping'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/setup/settlement-mapping`);
      if (!res.ok) throw new Error('Failed to fetch settlement mapping');
      return res.json() as Promise<SettlementMappingResponse>;
    },
    staleTime: 30 * 1000,
  });

  const accounts = useMemo(() => (accountsData ? accountsData.accounts : []), [accountsData]);
  const mappedCount = ALL_ACCOUNTS.filter((a) => state.accountMappings[a.key]).length;
  const taxEngineEnabled =
    connectionStatus?.usingSalesTax === true ? true : connectionStatus?.partnerTaxEnabled === true;

  const settlementComplete = useMemo(() => {
    if (connectionStatus?.connected !== true) return false;
    if (!settlementMappingData) return false;

    const needsUs = state.brands.some((b) => b.marketplace === 'amazon.com');
    const needsUk = state.brands.some((b) => b.marketplace === 'amazon.co.uk');

    const isConfigured = (input: { bank: string | null; payment: string | null; memoMappings: Record<string, string> }) => {
      const bankOk = typeof input.bank === 'string' ? input.bank.trim() !== '' : false;
      const paymentOk = typeof input.payment === 'string' ? input.payment.trim() !== '' : false;
      const memoOk = Object.keys(input.memoMappings).length > 0;
      return bankOk && paymentOk && memoOk;
    };

    const usOk = needsUs
      ? isConfigured({
          bank: settlementMappingData.usSettlementBankAccountId,
          payment: settlementMappingData.usSettlementPaymentAccountId,
          memoMappings: settlementMappingData.usSettlementAccountIdByMemo,
        })
      : true;

    const ukOk = needsUk
      ? isConfigured({
          bank: settlementMappingData.ukSettlementBankAccountId,
          payment: settlementMappingData.ukSettlementPaymentAccountId,
          memoMappings: settlementMappingData.ukSettlementAccountIdByMemo,
        })
      : true;

    return usOk && ukOk;
  }, [connectionStatus?.connected, settlementMappingData, state.brands]);

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
              <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
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
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
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
                    You can still add brands and SKUs. Connect QBO to map accounts and use dashboards.
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        <Card sx={{ mt: 3, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
              <Sidebar
                section={state.section}
                onSectionChange={(s) => saveState({ section: s })}
                catalogComplete={state.brands.length > 0 && state.skus.length > 0}
                accountsComplete={state.accountsCreated && mappedCount === ALL_ACCOUNTS.length}
                settlementComplete={settlementComplete}
              />

              <Box sx={{ flex: 1, p: 2 }}>
                <Box sx={{ maxWidth: 896 }}>
                  {state.section === 'brands' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <BrandsInventorySection brands={state.brands} skus={state.skus} onBrandsChange={saveBrands} onSkusChange={saveSkus} />
                    </Box>
                  )}
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
                  {state.section === 'settlement' && (
                    <SettlementSection
                      isQboConnected={connectionStatus?.connected === true}
                      isLoadingAccounts={isLoadingAccounts}
                      accounts={accounts}
                      mapping={settlementMappingData}
                      isLoadingMapping={isLoadingSettlementMapping}
                      brands={state.brands}
                      taxEngineEnabled={taxEngineEnabled}
                    />
                  )}
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
