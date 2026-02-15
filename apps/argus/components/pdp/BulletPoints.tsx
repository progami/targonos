'use client'

import { cn } from '@/lib/utils'

interface BulletPointsProps {
  bullets: {
    bullet1: string | null
    bullet2: string | null
    bullet3: string | null
    bullet4: string | null
    bullet5: string | null
  }
  diff?: {
    changedIndices: number[]
  }
}

export function BulletPoints({ bullets, diff }: BulletPointsProps) {
  const items = [bullets.bullet1, bullets.bullet2, bullets.bullet3, bullets.bullet4, bullets.bullet5]
  const rendered = items.filter((b): b is string => b !== null)

  return (
    <div className="py-4">
      <h3 className="text-sm font-semibold text-[#0F1111] mb-2 uppercase tracking-wide">
        About this item
      </h3>
      <ul className="list-disc pl-5 space-y-1.5">
        {rendered.map((text, i) => {
          const isChanged = diff?.changedIndices.includes(i)
          return (
            <li
              key={i}
              className={cn(
                'text-sm leading-relaxed text-[#0F1111]',
                isChanged && 'border-l-2 border-yellow-400 pl-2 -ml-2 bg-yellow-50/50',
              )}
            >
              {text}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
