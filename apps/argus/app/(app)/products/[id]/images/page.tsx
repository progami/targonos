import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ListingImageVersionsClient, type ImageVersionListItem } from '@/components/ListingImageVersionsClient';

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
      activeImageVersionId: true,
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
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/products/${target.id}`}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Listing Images"
        subtitle="Upload, version, and download listing image sets."
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

