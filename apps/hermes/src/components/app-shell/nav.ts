import {
  BarChart3,
  MessagesSquare,
  PackageSearch,
  Settings,
  ScrollText,
  PlugZap,
} from "lucide-react";

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
};

export const navGroups: readonly NavGroup[] = [
  {
    label: "Core",
    items: [
      { href: "/insights", label: "Insights", icon: BarChart3 },
      { href: "/orders", label: "Orders", icon: PackageSearch },
      { href: "/messaging", label: "Messaging", icon: MessagesSquare },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/accounts", label: "Accounts", icon: PlugZap },
      { href: "/logs", label: "Logs", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export const navItems = navGroups.flatMap((g) => g.items);
