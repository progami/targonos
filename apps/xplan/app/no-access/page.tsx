'use client';

import Link from 'next/link';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import OpenInNew from '@mui/icons-material/OpenInNew';

const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL;

if (!portalUrl) {
  throw new Error('NEXT_PUBLIC_PORTAL_AUTH_URL must be defined for the xplan no-access page.');
}

export default function NoAccessPage() {
  return (
    <Container maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', py: 6 }}>
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
            No Access to xplan
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
            Your account does not have permission to access xplan.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, textAlign: 'left' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            What does this mean?
          </Typography>
          <List dense disablePadding>
            <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
              <ListItemText
                primary="You are signed in but xplan access has not been granted to your account"
                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
              />
            </ListItem>
            <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
              <ListItemText
                primary="Contact your administrator to request access"
                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
              />
            </ListItem>
          </List>
        </Paper>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
          <Button
            component={Link}
            href={portalUrl}
            variant="contained"
            startIcon={<ArrowBack />}
          >
            Back to Portal
          </Button>
          <Button
            component="a"
            href="mailto:support@targonglobal.com?subject=xplan Access Request"
            variant="outlined"
            startIcon={<OpenInNew />}
          >
            Request Access
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary">
          If you believe this is an error, please contact your system administrator.
        </Typography>
      </Box>
    </Container>
  );
}
