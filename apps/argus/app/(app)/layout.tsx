'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import ViewInArIcon from '@mui/icons-material/ViewInAr'

const DRAWER_WIDTH = 292

const NAV_ITEMS = [
  {
    label: 'Listings',
    href: '/listings',
    icon: <ViewInArIcon />,
    description: 'Replica + version control',
  },
  {
    label: 'Monitoring',
    href: '/tracking',
    icon: <AutoGraphIcon />,
    description: 'Change feed + inspections',
  },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const normalizedPath = pathname.replace(/^\/argus/, '')

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        px: 2.25,
        py: 2,
        bgcolor: '#0f1d2b',
        color: '#f8fafc',
      }}
    >
      <Box
        sx={{
          px: 1.25,
          py: 1.5,
          borderRadius: 4,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)',
          border: '1px solid rgba(248, 250, 252, 0.08)',
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: 'rgba(248, 250, 252, 0.66)', letterSpacing: '0.12em' }}
        >
          Dust Sheets OS
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mt: 0.4 }}>
          Argus
        </Typography>
      </Box>

      <Divider sx={{ my: 2, borderColor: 'rgba(248, 250, 252, 0.08)' }} />

      <List sx={{ px: 0, py: 0 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = normalizedPath.startsWith(item.href)
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              selected={isActive}
              sx={{
                mb: 1,
                borderRadius: 3,
                alignItems: 'flex-start',
                color: '#f8fafc',
                '&.Mui-selected': {
                  bgcolor: 'rgba(248, 250, 252, 0.12)',
                },
                '&.Mui-selected:hover': {
                  bgcolor: 'rgba(248, 250, 252, 0.16)',
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: isActive ? '#f8fafc' : 'rgba(248, 250, 252, 0.72)',
                  minWidth: 40,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: 800 }}
                secondary={item.description}
                secondaryTypographyProps={{
                  sx: { color: 'rgba(248, 250, 252, 0.64)' },
                }}
              />
            </ListItemButton>
          )
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <Typography variant="caption" sx={{ color: 'rgba(248, 250, 252, 0.44)', px: 1.25, pb: 1 }}>
        File-backed monitoring
      </Typography>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f2eee6' }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          display: { md: 'none' },
          bgcolor: 'rgba(242, 238, 230, 0.92)',
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Argus
          </Typography>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              border: 0,
            },
          }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              border: 0,
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, md: 4 },
          pt: { xs: 10, md: 4 },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
