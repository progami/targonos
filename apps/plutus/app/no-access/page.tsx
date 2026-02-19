import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || process.env.PORTAL_AUTH_URL || '/'

export default function PlutusNoAccessPage() {
  return (
    <Box
      component="main"
      sx={{
        mx: 'auto',
        display: 'flex',
        minHeight: '100vh',
        maxWidth: '42rem',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 600 }}>No Access to Plutus</Typography>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
        Your account is authenticated, but it does not have Plutus access.
      </Typography>
      <Link href={portalUrl} underline="always" sx={{ textUnderlineOffset: '4px' }}>
        Return to portal
      </Link>
    </Box>
  )
}
