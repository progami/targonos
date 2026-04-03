import Link from 'next/link'
import {
  Box,
  Card,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import ListAltIcon from '@mui/icons-material/ListAlt'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
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

  const totalSnapshots = listings.reduce((sum, listing) => sum + listing._count.snapshots, 0)
  const totalRevisions = listings.reduce(
    (sum, listing) =>
      sum +
      listing._count.titleRevisions +
      listing._count.bulletsRevisions +
      listing._count.galleryRevisions +
      listing._count.videoRevisions +
      listing._count.ebcRevisions,
    0,
  )

  return (
    <Box
      sx={{
        mx: 'auto',
        display: 'grid',
        gap: 3,
        gridTemplateColumns: '1fr',
        alignItems: 'start',
      }}
    >
      <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>{listings.length}</strong> tracked PDPs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>{totalSnapshots}</strong> snapshots
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>{totalRevisions}</strong> revisions
        </Typography>
      </Stack>

      {listings.length > 0 ? (
        <Stack spacing={1}>
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
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Card
                  sx={{
                    p: { xs: 1.5, md: 1.75 },
                    borderRadius: 2,
                    transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
                    '&:hover': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 22px 40px -30px rgba(0, 44, 81, 0.45)',
                      borderColor: 'rgba(0, 194, 185, 0.18)',
                    },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: 'action.hover',
                        borderRadius: 2.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ListAltIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.03em' }}>
                        {listing.label !== listing.asin ? listing.label : listing.asin}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
                        {listing.label !== listing.asin ? `(${listing.asin})` : ''}
                        {listing.brandName && ` · ${listing.brandName}`}
                      </Typography>
                      <Stack direction="row" spacing={0.5} mt={1.2} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={`${listing._count.snapshots} snapshot${listing._count.snapshots !== 1 ? 's' : ''}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.675rem' }}
                        />
                        {listing._count.titleRevisions > 0 && (
                          <Chip
                            label={`Title ×${listing._count.titleRevisions}`}
                            size="small"
                            sx={{ height: 22, fontSize: '0.675rem' }}
                          />
                        )}
                        {listing._count.bulletsRevisions > 0 && (
                          <Chip
                            label={`Bullets ×${listing._count.bulletsRevisions}`}
                            size="small"
                            sx={{ height: 22, fontSize: '0.675rem' }}
                          />
                        )}
                        {listing._count.galleryRevisions > 0 && (
                          <Chip
                            label={`Gallery ×${listing._count.galleryRevisions}`}
                            size="small"
                            sx={{ height: 22, fontSize: '0.675rem' }}
                          />
                        )}
                        {listing._count.videoRevisions > 0 && (
                          <Chip
                            label={`Video ×${listing._count.videoRevisions}`}
                            size="small"
                            sx={{ height: 22, fontSize: '0.675rem' }}
                          />
                        )}
                        {listing._count.ebcRevisions > 0 && (
                          <Chip
                            label={`A+ ×${listing._count.ebcRevisions}`}
                            size="small"
                            sx={{ height: 22, fontSize: '0.675rem' }}
                          />
                        )}
                      </Stack>
                    </Box>
                    <ArrowOutwardIcon sx={{ color: 'text.secondary', fontSize: 20, flexShrink: 0 }} />
                  </Stack>
                </Card>
              </Link>
            )
          )}
        </Stack>
      ) : (
        <Card sx={{ p: 6, textAlign: 'center', borderRadius: 4 }}>
          <ListAltIcon sx={{ fontSize: 48, color: 'divider', mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            No listings yet
          </Typography>
        </Card>
      )}
    </Box>
  )
}
