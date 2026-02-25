'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import ListAltIcon from '@mui/icons-material/ListAlt'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'

const DRAWER_WIDTH = 240

const NAV_ITEMS = [
  { label: 'Listings', href: '/listings', icon: <ListAltIcon /> },
  { label: 'Tracking', href: '/tracking', icon: <TrendingUpIcon /> },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // Strip base path prefix for matching
  const normalizedPath = pathname.replace(/^\/argus/, '')

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap fontWeight={700}>
            Argus
          </Typography>
        </Toolbar>
        <List>
          {NAV_ITEMS.map((item) => {
            const isActive = normalizedPath.startsWith(item.href)
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={isActive}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          })}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        {children}
      </Box>
    </Box>
  )
}
