'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useWprPayloadQuery } from '@/hooks/use-wpr';
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
  const { data, isLoading, error } = useWprPayloadQuery();
  const activeTab = useWprStore((state) => state.activeTab);
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const setActiveTab = useWprStore((state) => state.setActiveTab);
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek);

  const tabFromQuery = getInitialWprTab(searchParams);

  useEffect(() => {
    if (activeTab !== tabFromQuery) {
      setActiveTab(tabFromQuery);
    }
  }, [activeTab, setActiveTab, tabFromQuery]);

  useEffect(() => {
    if (data === undefined) {
      return;
    }

    if (selectedWeek !== null && data.weeks.includes(selectedWeek)) {
      return;
    }

    setSelectedWeek(data.defaultWeek);
  }, [data, selectedWeek, setSelectedWeek]);

  const handleSelectTab = (tab: typeof activeTab) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
    router.replace(tab === 'sqp' ? '/wpr' : `/wpr?tab=${tab}`);
  };

  if (isLoading || data === undefined || selectedWeek === null) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error instanceof Error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const bundle = data.windowsByWeek[selectedWeek];
  if (bundle === undefined) {
    return <Alert severity="error">Unknown WPR week: {selectedWeek}</Alert>;
  }

  const changeEntries = data.changeLogByWeek[selectedWeek]
  if (changeEntries === undefined) {
    return <Alert severity="error">Missing WPR change log for {selectedWeek}</Alert>
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <WprTopBar
        activeTab={activeTab}
        selectedWeek={selectedWeek}
        weeks={data.weeks}
        onSelectTab={handleSelectTab}
        onSelectWeek={setSelectedWeek}
      />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 0, py: 1.5 }}>
        {activeTab === 'sqp' ? <SqpTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'scp' ? <ScpTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'br' ? <BusinessReportsTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'tst' ? <TstTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'changelog' ? <ChangelogTab entries={changeEntries} selectedWeekLabel={selectedWeek} /> : null}
        {activeTab === 'compare' ? <CompareTab bundle={bundle} changeEntries={changeEntries} /> : null}
        {activeTab === 'sources' ? <SourcesTab payload={data} /> : null}
      </Box>
    </Box>
  );
}
