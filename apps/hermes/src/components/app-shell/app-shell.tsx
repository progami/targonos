import * as React from "react";

import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { isHermesDryRun } from "@/server/env/flags";

const isDryRun = isHermesDryRun();

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {isDryRun && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-black">
          DRY-RUN MODE — No messages will be sent to customers
        </div>
      )}
      <div className="flex">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 px-3 py-3 md:px-4 md:py-3">{children}</main>
        </div>
      </div>
    </div>
  );
}
