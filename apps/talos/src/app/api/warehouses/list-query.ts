import type { Prisma } from '@targon/prisma-talos'

export const warehouseListSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  contactEmail: true,
  contactPhone: true,
  kind: true,
  isActive: true,
  rateListAttachment: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      users: true,
      costRates: true,
    },
  },
} satisfies Prisma.WarehouseSelect
