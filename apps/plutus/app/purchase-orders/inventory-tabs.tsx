'use client';

import { useEffect, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

export type InventoryTab = 'purchase-orders' | 'inventory-ledger' | 'cogs-postings';

type InventoryTabsClientProps = {
  initialActiveTab: InventoryTab;
  purchaseOrdersPanel: ReactNode;
  ledgerPanel: ReactNode;
  cogsPanel: ReactNode;
};

const tabs: Array<{ value: InventoryTab; label: string; queryValue: string | null }> = [
  { value: 'purchase-orders', label: '1. PO Source', queryValue: null },
  { value: 'inventory-ledger', label: '2. FIFO Ledger', queryValue: 'ledger' },
  { value: 'cogs-postings', label: '3. COGS Posted', queryValue: 'cogs' },
];

function inventoryTabFromSearch(search: string): InventoryTab {
  const value = new URLSearchParams(search).get('tab');
  if (value === null) return 'purchase-orders';
  if (value === 'po') return 'purchase-orders';
  if (value === 'ledger') return 'inventory-ledger';
  if (value === 'cogs') return 'cogs-postings';
  throw new Error(`Unsupported inventory tab: ${value}`);
}

function updateInventoryTabUrl(tab: InventoryTab) {
  const url = new URL(window.location.href);
  const tabConfig = tabs.find((candidate) => candidate.value === tab);
  if (tabConfig === undefined) {
    throw new Error(`Unsupported inventory tab: ${tab}`);
  }

  if (tabConfig.queryValue === null) {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tabConfig.queryValue);
  }

  window.history.pushState({ plutusInventoryTab: tab }, '', `${url.pathname}${url.search}${url.hash}`);
}

export function InventoryTabsClient({
  initialActiveTab,
  purchaseOrdersPanel,
  ledgerPanel,
  cogsPanel,
}: InventoryTabsClientProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>(initialActiveTab);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(inventoryTabFromSearch(window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const panels: Record<InventoryTab, ReactNode> = {
    'purchase-orders': purchaseOrdersPanel,
    'inventory-ledger': ledgerPanel,
    'cogs-postings': cogsPanel,
  };

  return (
    <>
      <Box role="tablist" aria-label="Inventory sections" sx={{ mt: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {tabs.map((tab) => {
          const active = tab.value === activeTab;
          return (
            <Button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`inventory-panel-${tab.value}`}
              id={`inventory-tab-${tab.value}`}
              variant={active ? 'contained' : 'outlined'}
              size="small"
              onClick={() => {
                if (active) return;
                setActiveTab(tab.value);
                updateInventoryTabUrl(tab.value);
              }}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                bgcolor: active ? '#00C2B9' : undefined,
                '&:hover': active ? { bgcolor: '#00a89f' } : undefined,
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Box>

      {tabs.map((tab) => (
        <Box
          key={tab.value}
          role="tabpanel"
          id={`inventory-panel-${tab.value}`}
          aria-labelledby={`inventory-tab-${tab.value}`}
          hidden={activeTab !== tab.value}
        >
          {panels[tab.value]}
        </Box>
      ))}
    </>
  );
}
