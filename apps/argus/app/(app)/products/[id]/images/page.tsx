import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ListingImageVersionsClient, type ImageVersionListItem } from '@/components/ListingImageVersionsClient';
import { ProductDetailHeader } from '@/components/ProductDetailHeader';

export const dynamic = 'force-dynamic';

export default async function ProductImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const target = await prisma.watchTarget.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      owner: true,
      label: true,
      asin: true,
      marketplace: true,
      enabled: true,
      activeImageVersionId: true,
      activeImageVersion: { select: { versionNumber: true } },
    },
  });

  if (!target || target.type !== 'ASIN') {
    notFound();
  }

  const versions = await prisma.listingImageVersion.findMany({
    where: { targetId: target.id },
    orderBy: [{ versionNumber: 'desc' }],
    include: { _count: { select: { slots: true } } },
  });

  const initialVersions: ImageVersionListItem[] = versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    label: v.label,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    createdByEmail: v.createdByEmail,
    imageCount: v._count.slots,
    isActive: target.activeImageVersionId === v.id,
  }));

  return (
    <div className="space-y-6">
      <ProductDetailHeader
        target={{
          id: target.id,
          label: target.label,
          asin: target.asin,
          marketplace: target.marketplace,
          owner: target.owner,
          enabled: target.enabled,
          activeImageVersionNumber: target.activeImageVersion?.versionNumber ?? null,
        }}
        activeTab="images"
      />

      <ListingImageVersionsClient
        targetId={target.id}
        targetLabel={target.label}
        asin={target.asin}
        marketplace={target.marketplace}
        owner={target.owner}
        initialActiveImageVersionId={target.activeImageVersionId}
        initialVersions={initialVersions}
      />
    </div>
  );
}
