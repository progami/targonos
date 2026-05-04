'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, CircularProgress } from '@mui/material';
import { parseArgusMarket, type ArgusMarket } from '@/lib/argus-market';
import {
  useWprChangeLogWeekQuery,
  useWprSourcesQuery,
  useWprWeekBundleQuery,
  useWprWeeksQuery,
} from '@/hooks/use-wpr';
import { getInitialWprTab } from '@/lib/wpr/dashboard-state';
import { useWprStore } from '@/stores/wpr-store';
import BrandMetricsTab from './tabs/brand-metrics-tab';
import BusinessReportsTab from './tabs/business-reports-tab';
import ChangelogTab from './tabs/changelog-tab';
import CompareTab from './tabs/compare-tab';
import ScpTab from './tabs/scp-tab';
import SourcesTab from './tabs/sources-tab';
import SqpTab from './tabs/sqp-tab';
import TstTab from './tabs/tst-tab';
import WprTopBar from './wpr-top-bar';

const BUNDLE_TABS = new Set(['sqp', 'scp', 'br', 'tst', 'brand', 'compare']);
const CHART_CHANGE_ENTRY_TABS = new Set(['sqp', 'scp', 'br', 'tst', 'brand', 'compare']);

export default function WprDashboardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useWprStore((state) => state.activeTab);
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const setActiveTab = useWprStore((state) => state.setActiveTab);
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek);
  const market = parseArgusMarket(searchParams.get('market'));
  const weeksQuery = useWprWeeksQuery(market);
  const needsBundle = BUNDLE_TABS.has(activeTab);
  const needsChartChangeEntries = CHART_CHANGE_ENTRY_TABS.has(activeTab);
  const bundleWeek = weeksQuery.data?.defaultWeek ?? null;
  const bundleQuery = useWprWeekBundleQuery(market, bundleWeek, needsBundle);
  const chartChangeLogQuery = useWprChangeLogWeekQuery(market, bundleWeek, needsChartChangeEntries);
  const changelogQuery = useWprChangeLogWeekQuery(market, selectedWeek, activeTab === 'changelog');
  const sourcesQuery = useWprSourcesQuery(market, activeTab === 'sources');

  const tabFromQuery = getInitialWprTab(searchParams);

  useEffect(() => {
    if (activeTab !== tabFromQuery) {
      setActiveTab(tabFromQuery);
    }
  }, [activeTab, setActiveTab, tabFromQuery]);

  useEffect(() => {
    if (weeksQuery.data === undefined) {
      return;
    }

    if (selectedWeek !== null && weeksQuery.data.weeks.includes(selectedWeek)) {
      return;
    }

    setSelectedWeek(weeksQuery.data.defaultWeek);
  }, [weeksQuery.data, selectedWeek, setSelectedWeek]);

  const handleSelectTab = (tab: typeof activeTab) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'sqp') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.replace(query === '' ? '/wpr' : `/wpr?${query}`);
  };

  const handleSelectMarket = (nextMarket: ArgusMarket) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMarket === 'us') {
      params.delete('market');
    } else {
      params.set('market', nextMarket);
    }
    const query = params.toString();
    setSelectedWeek(null);
    router.replace(query === '' ? '/wpr' : `/wpr?${query}`);
  };

  if (weeksQuery.error instanceof Error) {
    return <Alert severity="error">{weeksQuery.error.message}</Alert>;
  }

  if (bundleQuery.error instanceof Error) {
    return <Alert severity="error">{bundleQuery.error.message}</Alert>;
  }

  if (chartChangeLogQuery.error instanceof Error) {
    return <Alert severity="error">{chartChangeLogQuery.error.message}</Alert>;
  }

  if (changelogQuery.error instanceof Error) {
    return <Alert severity="error">{changelogQuery.error.message}</Alert>;
  }

  if (sourcesQuery.error instanceof Error) {
    return <Alert severity="error">{sourcesQuery.error.message}</Alert>;
  }

  if (weeksQuery.isLoading || weeksQuery.data === undefined || selectedWeek === null) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const bundle = bundleQuery.data;
  if (needsBundle && bundle === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const chartChangeEntries = chartChangeLogQuery.data;
  if (needsChartChangeEntries && chartChangeEntries === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const changelogEntries = changelogQuery.data;
  if (activeTab === 'changelog' && changelogEntries === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (activeTab === 'sources' && sourcesQuery.data === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <WprTopBar
        activeTab={activeTab}
        market={market}
        onSelectTab={handleSelectTab}
        onSelectMarket={handleSelectMarket}
      />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 0, py: 1.5 }}>
        {activeTab === 'sqp' && bundle !== undefined && chartChangeEntries !== undefined ? <SqpTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'scp' && bundle !== undefined && chartChangeEntries !== undefined ? <ScpTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'br' && bundle !== undefined && chartChangeEntries !== undefined ? <BusinessReportsTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'tst' && bundle !== undefined && chartChangeEntries !== undefined ? <TstTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'brand' && bundle !== undefined && chartChangeEntries !== undefined ? <BrandMetricsTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'changelog' && changelogEntries !== undefined ? (
          <ChangelogTab
            entries={changelogEntries}
            selectedWeek={selectedWeek}
            weeks={weeksQuery.data.weeks}
            weekStartDates={weeksQuery.data.weekStartDates}
            onSelectWeek={setSelectedWeek}
            market={market}
          />
        ) : null}
        {activeTab === 'compare' && bundle !== undefined && chartChangeEntries !== undefined ? <CompareTab bundle={bundle} changeEntries={chartChangeEntries} /> : null}
        {activeTab === 'sources' && sourcesQuery.data !== undefined ? <SourcesTab overview={sourcesQuery.data} /> : null}
      </Box>
    </Box>
  );
}
