import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import prisma from '@/lib/db'
import { getArgusMediaBackend, getArgusMediaS3Key } from '@/lib/media-backend'

export async function deleteOrphanMediaAssets(mediaIds: string[]): Promise<void> {
  const unique = Array.from(new Set(mediaIds)).filter((id) => id.length > 0)
  const backend = getArgusMediaBackend()
  const s3 = backend === 's3' ? (await import('@targon/aws-s3')).getS3Service() : null

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

    if (backend === 'local') {
      const absPath = join(process.cwd(), 'public', deleted.filePath)
      if (existsSync(absPath)) {
        unlinkSync(absPath)
      }
      continue
    }

    if (backend === 's3') {
      if (!s3) {
        throw new Error('S3 service missing while using the S3 media backend.')
      }

      await s3.deleteFile(getArgusMediaS3Key(deleted.filePath))
      continue
    }

    throw new Error(`Unsupported media backend: ${backend}`)
  }
}
