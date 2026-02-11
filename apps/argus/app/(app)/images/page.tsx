import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { ImageManagerClient, type ImageManagerItem } from '@/components/ImageManagerClient';

export const dynamic = 'force-dynamic';

export default async function ImageManagerPage() {
  const targets = await prisma.watchTarget.findMany({
    where: { owner: 'OURS', enabled: true },
    orderBy: [{ label: 'asc' }],
    include: {
      activeImageVersion: { select: { versionNumber: true } },
      imageVersions: { take: 1, orderBy: [{ createdAt: 'desc' }], select: { createdAt: true } },
      _count: { select: { imageVersions: true } },
    },
  });

  const items: ImageManagerItem[] = targets.map((t) => ({
    id: t.id,
    label: t.label,
    asin: t.asin,
    marketplace: t.marketplace,
    activeVersionNumber: t.activeImageVersion ? t.activeImageVersion.versionNumber : null,
    versionsCount: t._count.imageVersions,
    lastUploadAt: t.imageVersions.length > 0 ? t.imageVersions[0]!.createdAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Image Manager"
        subtitle="Asset manager for our listing image sets. Upload snapshots, track versions, and revert."
      />
      <ImageManagerClient items={items} />
    </div>
  );
}
