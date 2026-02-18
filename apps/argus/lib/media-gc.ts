import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import prisma from '@/lib/db'

export async function deleteOrphanMediaAssets(mediaIds: string[]): Promise<void> {
  const unique = Array.from(new Set(mediaIds)).filter((id) => id.length > 0)

  for (const mediaId of unique) {
    const [galleryRefs, ebcRefs, videoRefs] = await Promise.all([
      prisma.gallerySlot.count({ where: { mediaId } }),
      prisma.ebcImage.count({ where: { mediaId } }),
      prisma.videoRevision.count({
        where: {
          OR: [{ mediaId }, { posterMediaId: mediaId }],
        },
      }),
    ])

    if (galleryRefs > 0 || ebcRefs > 0 || videoRefs > 0) continue

    const deleted = await prisma.mediaAsset.delete({ where: { id: mediaId } })
    const absPath = join(process.cwd(), 'public', deleted.filePath)
    if (existsSync(absPath)) {
      unlinkSync(absPath)
    }
  }
}
