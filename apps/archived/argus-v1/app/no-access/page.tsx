'use client'

import Link from 'next/link'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import ArrowBack from '@mui/icons-material/ArrowBack'

const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || '/'

export default function NoAccessPage() {
  return (
    <Container
      maxWidth="sm"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        py: 6,
      }}
    >
      <Box sx={{ width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Box>
          <Avatar
            sx={{
              mx: 'auto',
              width: 96,
              height: 96,
              bgcolor: 'warning.light',
              color: 'warning.dark',
            }}
          >
            <ShieldOutlined sx={{ fontSize: 48 }} />
          </Avatar>
          <Typography variant="h4" sx={{ mt: 3, fontWeight: 800 }}>
            No Access to Argus
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
            Your account does not have permission to access Argus.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, textAlign: 'left' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            What can you do?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contact your administrator to request access.
          </Typography>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            component={Link}
            href={portalUrl}
            variant="contained"
            startIcon={<ArrowBack />}
          >
            Back to Portal
          </Button>
        </Box>
      </Box>
    </Container>
  )
}

