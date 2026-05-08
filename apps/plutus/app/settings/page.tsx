'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { PageHeader } from '@/components/page-header';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  canConnect: boolean;
  companyName?: string;
  homeCurrency?: string;
  error?: string;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function disconnectQbo(): Promise<{ success: boolean }> {
  const res = await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
  return res.json();
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: status, isLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectQbo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      enqueueSnackbar('Disconnected from QuickBooks', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Failed to disconnect', { variant: 'error' });
    },
  });

  function handleConnect() {
    window.location.href = `${basePath}/api/qbo/connect`;
  }

  const connectionLabel = isLoading ? 'Checking...' : status?.connected === true ? status.companyName ?? 'Connected' : 'Not connected';

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader title="Settings" variant="accent" />

        <Card sx={{ mt: 3, border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              QuickBooks Online
            </Typography>
            <Typography sx={{ mt: 1, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
              {connectionLabel}
            </Typography>
            {status?.connected === true && status.homeCurrency ? (
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>Home currency: {status.homeCurrency}</Typography>
            ) : null}
            {!isLoading && status?.connected === false && status.error ? (
              <Typography sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>{status.error}</Typography>
            ) : null}

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              {status?.connected === true ? (
                status.canConnect ? (
                  <Button
                    variant="outlined"
                    sx={{ borderColor: 'divider', color: 'text.primary' }}
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                ) : (
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    Ask a platform admin to disconnect or reconnect QBO.
                  </Typography>
                )
              ) : status?.canConnect === true ? (
                <Button
                  variant="contained"
                  sx={{ bgcolor: '#00C2B9', color: '#fff', '&:hover': { bgcolor: '#00a89f' } }}
                  onClick={handleConnect}
                >
                  Connect to QuickBooks
                </Button>
              ) : (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  Ask a platform admin to connect QBO.
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
