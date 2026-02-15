'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { QboConnectionStatus } from '@/lib/qbo/types';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

async function fetchQboStatus(): Promise<QboConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function disconnectQbo(): Promise<{ success: boolean }> {
  const res = await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
  return res.json();
}

export function QboStatusIndicator() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const { data: status, isLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchQboStatus,
    staleTime: 5 * 60 * 1000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectQbo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      enqueueSnackbar('Disconnected from QuickBooks', { variant: 'success' });
      setAnchorEl(null);
    },
    onError: () => {
      enqueueSnackbar('Failed to disconnect', { variant: 'error' });
    },
  });

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      enqueueSnackbar('Successfully connected to QuickBooks!', { variant: 'success' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_params: 'Invalid OAuth parameters',
        invalid_state: 'Security check failed. Please try again.',
        token_exchange_failed: 'Failed to connect. Please try again.',
        connect_failed: 'Failed to initiate connection.',
      };
      const message = errorMessages[error];
      enqueueSnackbar(message === undefined ? 'Connection failed' : message, { variant: 'error' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, queryClient, enqueueSnackbar]);

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 99,
          bgcolor: 'action.hover',
        }}
      >
        <Box
          sx={{
            height: 10,
            width: 10,
            borderRadius: '50%',
            bgcolor: 'action.disabled',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.5 },
            },
          }}
        />
        <Typography variant="body2" sx={{ color: 'text.disabled' }}>
          QBO
        </Typography>
      </Box>
    );
  }

  if (status?.connected) {
    return (
      <>
        <Box
          component="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: 99,
            bgcolor: 'rgba(34, 197, 94, 0.08)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
            '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.15)' },
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <Box sx={{ height: 10, width: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                height: 10,
                width: 10,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                opacity: 0.5,
                '@keyframes ping': {
                  '75%, 100%': { transform: 'scale(2)', opacity: 0 },
                },
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, color: '#15803d' }}>
            QBO
          </Typography>
        </Box>

        <DropdownMenu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={() => setAnchorEl(null)}
          align="right"
          sx={{ width: 224 }}
        >
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              Connected to
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status.companyName}
            </Typography>
          </Box>
          <Box sx={{ p: 0.5 }}>
            <DropdownMenuItem
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              sx={{ color: 'error.main' }}
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </DropdownMenuItem>
          </Box>
        </DropdownMenu>
      </>
    );
  }

  return (
    <Box
      component="button"
      onClick={handleConnect}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 99,
        bgcolor: 'action.hover',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
        Connect QBO
      </Typography>
    </Box>
  );
}
