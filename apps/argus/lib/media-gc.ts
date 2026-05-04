import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import prisma from '@/lib/db'
import { getArgusMediaBackend, requireArgusS3MediaConfig } from '@/lib/media-backend'

export async function deleteOrphanMediaAssets(mediaIds: string[]): Promise<void> {
  const unique = Array.from(new Set(mediaIds)).filter((id) => id.length > 0)
  const backend = getArgusMediaBackend()
  if (backend === 's3') {
    requireArgusS3MediaConfig()
  }
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

    const hasReferences = [galleryRefs, ebcRefs, videoRefs].some((count) => count > 0)
    if (hasReferences) continue

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

      const config = requireArgusS3MediaConfig()
      if (deleted.storageBackend !== 'S3') {
        throw new Error(`Deleted media asset ${deleted.id} was not stored in S3.`)
      }
      if (deleted.s3Bucket !== config.bucket) {
        throw new Error(`Deleted media asset ${deleted.id} belongs to ${deleted.s3Bucket}, not ${config.bucket}.`)
      }
      if (deleted.s3Key === null) {
        throw new Error(`Deleted media asset ${deleted.id} is missing s3Key.`)
      }

      await s3.deleteFile(deleted.s3Key)
      continue
    }

    throw new Error(`Unsupported media backend: ${backend}`)
  }
}
