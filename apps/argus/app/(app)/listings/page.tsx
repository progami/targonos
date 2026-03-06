import Link from 'next/link'
import {
  Box,
  Card,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import ListAltIcon from '@mui/icons-material/ListAlt'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ListingsPage() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      asin: true,
      label: true,
      brandName: true,
      _count: {
        select: {
          snapshots: true,
          titleRevisions: true,
          bulletsRevisions: true,
          galleryRevisions: true,
          videoRevisions: true,
          ebcRevisions: true,
        },
      },
    },
  })

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" mb={2}>
        Listings
      </Typography>

      {listings.length > 0 ? (
        <Stack spacing={1.5}>
          {listings.map(
            (listing: {
              id: string
              asin: string
              label: string
              brandName: string | null
              _count: {
                snapshots: number
                titleRevisions: number
                bulletsRevisions: number
                galleryRevisions: number
                videoRevisions: number
                ebcRevisions: number
              }
            }) => (
              <Card
                key={listing.id}
                component={Link}
                href={`/listings/${listing.id}`}
                sx={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  p: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.15s',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ListAltIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={500}>
                      {listing.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {listing.asin}
                      {listing.brandName && ` · ${listing.brandName}`}
                    </Typography>
                    <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap">
                      <Chip
                        label={`${listing._count.snapshots} snapshot${listing._count.snapshots !== 1 ? 's' : ''}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.675rem' }}
                      />
                      {listing._count.titleRevisions > 0 && (
                        <Chip
                          label={`Title ×${listing._count.titleRevisions}`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.675rem' }}
                        />
                      )}
                      {listing._count.bulletsRevisions > 0 && (
                        <Chip
                          label={`Bullets ×${listing._count.bulletsRevisions}`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.675rem' }}
                        />
                      )}
                      {listing._count.galleryRevisions > 0 && (
                        <Chip
                          label={`Gallery ×${listing._count.galleryRevisions}`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.675rem' }}
                        />
                      )}
                      {listing._count.videoRevisions > 0 && (
                        <Chip
                          label={`Video ×${listing._count.videoRevisions}`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.675rem' }}
                        />
                      )}
                      {listing._count.ebcRevisions > 0 && (
                        <Chip
                          label={`A+ ×${listing._count.ebcRevisions}`}
                          size="small"
                          sx={{ height: 20, fontSize: '0.675rem' }}
                        />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Card>
            )
          )}
        </Stack>
      ) : (
        <Card sx={{ p: 6, textAlign: 'center' }}>
          <ListAltIcon sx={{ fontSize: 48, color: 'divider', mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            No listings yet
          </Typography>
        </Card>
      )}
    </Box>
  )
}
