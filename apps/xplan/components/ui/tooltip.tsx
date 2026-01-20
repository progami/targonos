'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Backwards-compatible simple Tooltip API
type SimpleTooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
};

function FormattedTooltipText({ value }: { value: string }) {
  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trim()))
    .filter((block) => block.some(Boolean));

  return (
    <div className="space-y-2">
      {blocks.map((lines, blockIndex) => {
        const blockKey = `${blockIndex}:${lines.join('\n')}`;
        return (
          <div key={blockKey} className={cn(blockIndex > 0 && 'border-t border-border/70 pt-2')}>
            <div className="space-y-1">
              {lines.map((line, lineIndex) => {
                if (!line) return null;
                const match = line.match(/^([^:]{1,40}):\s*(.*)$/);
                if (!match) {
                  return (
                    <div key={`${blockKey}:${lineIndex}`} className="text-popover-foreground/90">
                      {line}
                    </div>
                  );
                }

                const label = match[1]!;
                const rest = match[2] ?? '';

                if (label.toLowerCase() === 'sku' || label.toLowerCase() === 'skus') {
                  return (
                    <div
                      key={`${blockKey}:${lineIndex}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                    >
                      <span className="text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        {label}
                      </span>
                      <span className="font-semibold text-popover-foreground">{rest}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${blockKey}:${lineIndex}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                  >
                    <span className="font-semibold text-popover-foreground">{label}:</span>
                    <span className="text-popover-foreground/90">{rest}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tooltip({
  content,
  children,
  position = 'top',
  delay = 100,
  className,
  style,
}: SimpleTooltipProps) {
  const sideMap: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
  };

  return (
    <TooltipRoot delayDuration={delay}>
      <TooltipTrigger asChild>
        <div className={className} style={style}>
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side={sideMap[position]}
        className="max-w-sm break-words rounded-xl border border-border/70 bg-popover/95 px-3 py-2 text-sm leading-relaxed text-popover-foreground shadow-xl backdrop-blur"
      >
        {typeof content === 'string' ? <FormattedTooltipText value={content} /> : content}
      </TooltipContent>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipProvider };
