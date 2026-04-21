'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, CircularProgress } from '@mui/material';
import {
  useWprChangeLogWeekQuery,
  useWprSourcesQuery,
  useWprWeekBundleQuery,
  useWprWeeksQuery,
} from '@/hooks/use-wpr';
import { getInitialWprTab } from '@/lib/wpr/dashboard-state';
import { useWprStore } from '@/stores/wpr-store';
import BusinessReportsTab from './tabs/business-reports-tab';
import ChangelogTab from './tabs/changelog-tab';
import CompareTab from './tabs/compare-tab';
import ScpTab from './tabs/scp-tab';
import SourcesTab from './tabs/sources-tab';
import SqpTab from './tabs/sqp-tab';
import TstTab from './tabs/tst-tab';
import WprTopBar from './wpr-top-bar';

export default function WprDashboardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useWprStore((state) => state.activeTab);
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const setActiveTab = useWprStore((state) => state.setActiveTab);
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek);
  const weeksQuery = useWprWeeksQuery();
  const needsBundle = activeTab === 'sqp' || activeTab === 'scp' || activeTab === 'br' || activeTab === 'tst' || activeTab === 'compare';
  const needsChangeEntries = activeTab === 'sqp' || activeTab === 'scp' || activeTab === 'br' || activeTab === 'tst' || activeTab === 'changelog' || activeTab === 'compare';
  const bundleQuery = useWprWeekBundleQuery(selectedWeek, needsBundle);
  const changeLogQuery = useWprChangeLogWeekQuery(selectedWeek, needsChangeEntries);
  const sourcesQuery = useWprSourcesQuery(activeTab === 'sources');

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
    router.replace(tab === 'sqp' ? '/wpr' : `/wpr?tab=${tab}`);
  };

  if (weeksQuery.error instanceof Error) {
    return <Alert severity="error">{weeksQuery.error.message}</Alert>;
  }

  if (bundleQuery.error instanceof Error) {
    return <Alert severity="error">{bundleQuery.error.message}</Alert>;
  }

  if (changeLogQuery.error instanceof Error) {
    return <Alert severity="error">{changeLogQuery.error.message}</Alert>;
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

  const changeEntries = changeLogQuery.data
  if (needsChangeEntries && changeEntries === undefined) {
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
        selectedWeek={selectedWeek}
        weeks={weeksQuery.data.weeks}
        onSelectTab={handleSelectTab}
        onSelectWeek={setSelectedWeek}
      />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 0, py: 1.5 }}>
        {activeTab === 'sqp' && bundle !== undefined && changeEntries !== undefined ? <SqpTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'scp' && bundle !== undefined && changeEntries !== undefined ? <ScpTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'br' && bundle !== undefined && changeEntries !== undefined ? <BusinessReportsTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'tst' && bundle !== undefined && changeEntries !== undefined ? <TstTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'changelog' && changeEntries !== undefined ? <ChangelogTab entries={changeEntries} selectedWeekLabel={selectedWeek} /> : null}
        {activeTab === 'compare' && bundle !== undefined && changeEntries !== undefined ? <CompareTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'sources' && sourcesQuery.data !== undefined ? <SourcesTab overview={sourcesQuery.data} /> : null}
      </Box>
    </Box>
  );
}
