"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navItems } from "@/components/app-shell/nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen md:flex md:w-64 md:flex-col md:border-r bg-background">
      <div className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-card font-semibold">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              aria-hidden="true"
              className="text-foreground"
            >
              <path
                d="M9.6 10.2c-2.6-1.1-4.2-3-4.8-5.6c2.6 0.2 4.9 1.2 6.6 2.9"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M10.2 8.9c-1.5-0.8-2.6-1.8-3.2-3.2c1.6 0.1 3.0 0.6 4.2 1.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M7.6 16h8.1c2.4 0 4.3-1.6 4.3-3.9c0-1-0.4-1.9-1.1-2.6l-1.1-1.1c-.6-.6-1.4-.9-2.2-.9h-3.4c-1 0-1.9.4-2.6 1.1l-1.7 1.7c-.8.8-1.2 1.6-1.2 2.7V16"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7.6 16h12.8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                opacity="0.65"
              />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Hermes</div>
            <div className="text-xs text-muted-foreground">Automation</div>
          </div>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <nav className="px-3 py-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      active && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </ScrollArea>
      <Separator />
      <div className="mt-auto px-6 py-3 text-[11px] text-muted-foreground">
        Ops console
      </div>
    </aside>
  );
}
