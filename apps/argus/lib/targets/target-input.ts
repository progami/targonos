import { z } from 'zod';
import type { Marketplace, WatchTargetOwner, WatchTargetType } from '@targon/prisma-argus';

const WatchTargetTypeSchema = z.enum(['ASIN', 'SEARCH', 'BROWSE_BESTSELLERS']) satisfies z.ZodType<WatchTargetType>;
const MarketplaceSchema = z.enum(['US', 'UK']) satisfies z.ZodType<Marketplace>;
const WatchTargetOwnerSchema = z.enum(['OURS', 'COMPETITOR']) satisfies z.ZodType<WatchTargetOwner>;

const TrackedAsinsSchema = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((items) => Array.from(new Set(items.map((v) => v.toUpperCase()))));

export const WatchTargetInputSchema = z
  .object({
    type: WatchTargetTypeSchema,
    marketplace: MarketplaceSchema,
    owner: WatchTargetOwnerSchema,
    label: z.string().trim().min(1),
    asin: z.string().trim().min(1).optional(),
    keyword: z.string().trim().min(1).optional(),
    sourceUrl: z.string().trim().url().optional(),
    browseNodeId: z.string().trim().min(1).optional(),
    trackedAsins: TrackedAsinsSchema,
    cadenceMinutes: z.number().int().positive().default(360),
    enabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'ASIN') {
      if (!data.asin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'asin is required for ASIN targets', path: ['asin'] });
      }
    }

    if (data.type === 'SEARCH') {
      if (!data.keyword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'keyword is required for SEARCH targets',
          path: ['keyword'],
        });
      }
    }

    if (data.type === 'BROWSE_BESTSELLERS') {
      if (!data.sourceUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sourceUrl is required for BROWSE_BESTSELLERS targets',
          path: ['sourceUrl'],
        });
      }
    }
  });

export type WatchTargetInput = z.infer<typeof WatchTargetInputSchema>;

