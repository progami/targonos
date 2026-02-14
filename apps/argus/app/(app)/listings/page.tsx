import Link from 'next/link'

export default function ListingsPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Listings</h1>
      <div className="border rounded-lg p-6 hover:bg-muted/50 transition-colors">
        <Link
          href="/listings/B09HXC3NL8"
          className="block"
        >
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
    </div>
  )
}
