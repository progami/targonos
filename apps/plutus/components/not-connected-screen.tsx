'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { Button } from '@/components/ui/button';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

function QboLogo() {
  return (
    <svg style={{ width: 96, height: 96 }} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#dcfce7" stroke="#86efac" strokeWidth="1.5" />
      <path
        d="M24 12c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12z"
        stroke="#22c55e"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M20 20h8v4a4 4 0 01-4 4h0a4 4 0 01-4-4v-4z"
        fill="#bbf7d0"
        stroke="#22c55e"
        strokeWidth="1.5"
      />
      <path d="M24 28v6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface NotConnectedScreenProps {
  title: string;
  error?: string;
}

export function NotConnectedScreen({ title, error }: NotConnectedScreenProps) {
  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: { xs: 8, md: 12 } }}>
      <Box sx={{ maxWidth: 448, width: '100%', px: { xs: 2, sm: 3 } }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 5,
            textAlign: 'center',
            boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Box sx={{ position: 'relative' }}>
              <QboLogo />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  display: 'flex',
                  height: 32,
                  width: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  border: 2,
                  borderColor: 'background.paper',
                  bgcolor: 'action.hover',
                }}
              >
                <svg style={{ width: 16, height: 16, color: '#94a3b8' }} viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </Box>
            </Box>
          </Box>

          <Typography
            variant="caption"
            sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2384a1' }}
          >
            QuickBooks Online
          </Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 600, color: 'text.primary' }}>
            Connect to continue
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', lineHeight: 1.6 }}>
            Connect your QuickBooks Online account to view and manage your {title.toLowerCase()}.
          </Typography>
          <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary', lineHeight: 1.6 }}>
            This connection is shared across Plutus users. If you are not a QuickBooks Company Admin, ask one to connect.
          </Typography>

          <Box sx={{ mt: 4 }}>
            <Button
              onClick={handleConnect}
              sx={{
                width: '100%',
                borderRadius: 3,
                background: 'linear-gradient(to right, #45B3D4, #2fa3c7)',
                color: '#fff',
                boxShadow: '0 4px 16px rgba(69, 179, 212, 0.25)',
                '&:hover': { background: 'linear-gradient(to right, #2fa3c7, #2384a1)' },
              }}
            >
              Connect to QuickBooks
            </Button>
            {error && (
              <Box
                sx={{
                  mt: 2,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  borderRadius: 2,
                  bgcolor: 'error.main',
                  opacity: 0.1,
                  px: 2,
                  py: 1.5,
                  textAlign: 'left',
                }}
              >
                <Box
                  component="span"
                  sx={{ mt: 0.25, display: 'inline-block', height: 8, width: 8, borderRadius: '50%', bgcolor: 'error.main', opacity: 0.8 }}
                />
                <Typography variant="body2" sx={{ color: 'error.main' }}>
                  {error}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
