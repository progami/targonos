import Link from 'next/link'
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
      _count: { select: { snapshots: true, bulletsRevisions: true, galleryRevisions: true, ebcRevisions: true } },
    },
  })

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Listings</h1>

      {listings.length > 0 ? (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="border rounded-lg p-6 hover:bg-muted/50 transition-colors">
              <Link href={`/listings/${listing.id}`} className="block">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                    IMG
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium">{listing.label}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      ASIN: {listing.asin}
                      {listing.brandName && ` · ${listing.brandName}`}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        {listing._count.snapshots} snapshot{listing._count.snapshots !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        B v{listing._count.bulletsRevisions}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        G v{listing._count.galleryRevisions}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        E v{listing._count.ebcRevisions}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        /* Fallback: hardcoded fixture link when no DB data */
        <div className="border rounded-lg p-6 hover:bg-muted/50 transition-colors">
          <Link href="/listings/B09HXC3NL8" className="block">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                IMG
              </div>
              <div>
                <h2 className="font-medium">
                  6 Pack Extra Large Clear Painter&apos;s Drop Cloth for Painting
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  ASIN: B09HXC3NL8
                </p>
                <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                  Reference fixture loaded
                </span>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}
