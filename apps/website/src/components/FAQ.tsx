'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FAQItem = {
  question: string;
  answer: string;
};

export function FAQ({ items }: { items: FAQItem[] }) {
  return (
    <Accordion.Root type="multiple" className="w-full">
      {items.map((item) => (
        <Accordion.Item
          key={item.question}
          value={item.question}
          className="rounded-card border border-border bg-surface px-4 py-2 shadow-softer"
        >
          <Accordion.Header>
            <Accordion.Trigger
              className={cn(
                'flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
              )}
            >
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition data-[state=open]:rotate-180" />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className="pb-3 pr-6 text-sm text-muted">{item.answer}</div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
