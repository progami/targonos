"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { navItems } from "@/components/app-shell/nav";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
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
  const pathname = usePathname() ?? "/";
  const crumbs = breadcrumbFromPath(pathname);
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {back ? (
            <Button asChild variant="ghost" size="icon" aria-label={`Back to ${back.label}`}>
              <Link href={back.href}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
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
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
