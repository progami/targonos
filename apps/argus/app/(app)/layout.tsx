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

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')
const DRAWER_WIDTH = 240

const NAV_ITEMS = [
  { label: 'Listings', href: `${basePath}/listings`, icon: <ListAltIcon /> },
  { label: 'Tracking', href: `${basePath}/tracking`, icon: <TrendingUpIcon /> },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
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
          <Typography variant="h6" noWrap fontWeight={700} color="primary">
            Argus
          </Typography>
        </Toolbar>
        <List>
          {NAV_ITEMS.map((item) => {
            const isActive = normalizedPath.startsWith(
              item.href.replace(basePath, '')
            )
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={isActive}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'inherit' },
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          })}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, bgcolor: 'background.default' }}
      >
        {children}
      </Box>
    </Box>
  )
}
