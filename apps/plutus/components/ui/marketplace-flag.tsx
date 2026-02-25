import Box from '@mui/material/Box';

export function MarketplaceFlag({ region }: { region: 'US' | 'UK' }) {
  if (region === 'US') {
    return (
      <Box
        component="span"
        title="United States"
        sx={{
          display: 'inline-flex',
          height: 24,
          width: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 99,
          bgcolor: 'rgba(59, 130, 246, 0.05)',
          fontSize: '0.75rem',
        }}
      >
        <svg style={{ height: 14, width: 14 }} viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#2563eb" />
          <path d="M1 5h14M1 7h14M1 9h14M1 11h14" stroke="white" strokeWidth="0.6" />
          <rect x="1" y="3" width="6" height="5" fill="#1e40af" />
        </svg>
      </Box>
    );
  }
  return (
    <Box
      component="span"
      title="United Kingdom"
      sx={{
        display: 'inline-flex',
        height: 24,
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 99,
        bgcolor: 'rgba(239, 68, 68, 0.05)',
        fontSize: '0.75rem',
      }}
    >
      <svg style={{ height: 14, width: 14 }} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#1d4ed8" />
        <path d="M1 3l14 10M15 3L1 13" stroke="white" strokeWidth="1.5" />
        <path d="M1 3l14 10M15 3L1 13" stroke="#dc2626" strokeWidth="0.8" />
        <path d="M8 3v10M1 8h14" stroke="white" strokeWidth="2.5" />
        <path d="M8 3v10M1 8h14" stroke="#dc2626" strokeWidth="1.5" />
      </svg>
    </Box>
  );
}
