"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { navItems } from "@/components/app-shell/nav";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function breadcrumbFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Dashboard", href: "/" }];

  const crumbs: Array<{ label: string; href: string }> = [{ label: "Dashboard", href: "/" }];
  let acc = "";
  for (const p of parts) {
    acc += "/" + p;
    const label =
      navItems.find((n) => n.href === acc)?.label ??
      p.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
    crumbs.push({ label, href: acc });
  }
  return crumbs;
}

export function AppHeader() {
  const pathname = usePathname() || "/";
  const crumbs = breadcrumbFromPath(pathname);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <nav className="hidden min-w-0 items-center gap-2 text-sm md:flex">
            {crumbs.map((c, idx) => (
              <span key={c.href} className="min-w-0">
                {idx > 0 && <span className="px-1 text-muted-foreground">/</span>}
                <Link
                  href={c.href}
                  className={cn("truncate", idx === crumbs.length - 1 ? "font-medium" : "text-muted-foreground hover:text-foreground")}
                >
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>

          <div className="hidden max-w-md flex-1 items-center gap-2 md:flex">
            <div className="relative w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search campaigns, orders, logs…" className="pl-8" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
