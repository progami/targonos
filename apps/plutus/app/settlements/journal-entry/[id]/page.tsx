'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import { NotConnectedScreen } from '@/components/not-connected-screen';
import { buildLegacySettlementApiPath } from '@/lib/plutus/legacy-settlement-routes';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; canConnect: boolean; error?: string };

type LegacySettlementResponse = {
  parent: {
    region: 'US' | 'UK';
    sourceSettlementId: string;
  };
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchLegacySettlement(id: string): Promise<LegacySettlementResponse> {
  const res = await fetch(`${basePath}${buildLegacySettlementApiPath(id)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.error ?? 'Failed to resolve settlement route');
  }
  return data as LegacySettlementResponse;
}

export default function LegacySettlementRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  if (id === '') {
    throw new Error('Settlement id param is required');
  }

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['legacy-settlement', id],
    queryFn: () => fetchLegacySettlement(id),
    enabled: connection?.connected !== false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    router.replace(`/settlements/${data.parent.region}/${encodeURIComponent(data.parent.sourceSettlementId)}`);
  }, [data, router]);

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Details" canConnect={connection.canConnect} error={connection.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ maxWidth: '48rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 6 }}>
        <Card sx={{ border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
            {(isLoading || !data) && !error && (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Skeleton variant="text" sx={{ width: 220, fontSize: '1.5rem' }} />
                <Skeleton variant="rounded" sx={{ height: 80 }} />
              </Box>
            )}

            {error && (
              <Typography color="error.main">
                {error instanceof Error ? error.message : String(error)}
              </Typography>
            )}

            {!isLoading && !error && (
              <Typography sx={{ color: 'text.secondary' }}>
                Redirecting to the parent settlement view…
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
