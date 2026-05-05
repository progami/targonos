'use client';

import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

import { PageHeader } from '@/components/page-header';

const QUEUES = [
  {
    href: '/settlements',
    title: 'Settlement Exceptions',
    label: 'Amazon settlement posting',
    icon: ReceiptLongIcon,
    items: ['missing account or tax mapping', 'unsupported Amazon event type', 'settlement-control mismatch'],
  },
  {
    href: '/cogs-inputs',
    title: 'COGS Input Exceptions',
    label: 'QBO source document intake',
    icon: Inventory2OutlinedIcon,
    items: ['missing SKU mapping', 'missing unit quantity', 'incomplete bill or purchase cost support'],
  },
] as const;

export default function ExceptionsPage() {
  return (
    <Box component="main" className="page-enter" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader title="Exceptions" variant="accent" />

        <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {QUEUES.map((queue) => {
            const Icon = queue.icon;
            return (
              <Card key={queue.href} sx={{ borderColor: 'divider' }}>
                <CardActionArea component={Link} href={queue.href}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          bgcolor: 'rgba(0, 194, 185, 0.1)',
                          color: '#008f87',
                        }}
                      >
                        <Icon sx={{ fontSize: 19 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary' }}>
                          {queue.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                          {queue.label}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {queue.items.map((item) => (
                        <Chip
                          key={item}
                          label={item}
                          size="small"
                          variant="outlined"
                          sx={{ borderRadius: 1.5, fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
