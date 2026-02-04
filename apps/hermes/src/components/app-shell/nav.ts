import {
  BarChart3,
  MessagesSquare,
  PackageSearch,
  Settings,
  ScrollText,
  PlugZap,
} from "lucide-react";

export const navItems = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/orders", label: "Orders", icon: PackageSearch },
  { href: "/messaging", label: "Messaging", icon: MessagesSquare },
  { href: "/accounts", label: "Accounts", icon: PlugZap },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
