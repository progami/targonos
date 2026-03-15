'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FAQItem = {
  question: string;
  answer: string;
};

export function FAQ({ items, variant = 'light' }: { items: FAQItem[]; variant?: 'light' | 'dark' }) {
  const isDark = variant === 'dark';

  return (
    <Accordion.Root type="multiple" className="w-full space-y-3">
      {items.map((item) => (
        <Accordion.Item
          key={item.question}
          value={item.question}
          className={cn(
            'rounded-card px-5 py-2',
            isDark
              ? 'border border-white/10 bg-white/[0.04] backdrop-blur-md'
              : 'border border-border bg-surface shadow-softer'
          )}
        >
          <Accordion.Header>
            <Accordion.Trigger
              className={cn(
                'flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold',
                isDark ? 'text-white' : 'text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
              )}
            >
              {item.question}
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition data-[state=open]:rotate-180', isDark ? 'text-[#3AF3FF]' : 'text-muted')} />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className={cn('pb-3 pr-6 text-sm', isDark ? 'text-white/55' : 'text-muted')}>{item.answer}</div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
