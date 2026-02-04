import {
  BarChart3,
  LayoutTemplate,
  Megaphone,
  MessagesSquare,
  PackageSearch,
  Settings,
  SplitSquareVertical,
  ScrollText,
  PlugZap,
} from "lucide-react";

export const navItems = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/orders", label: "Orders", icon: PackageSearch },
  { href: "/messaging", label: "Messaging", icon: MessagesSquare },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/experiments", label: "Experiments", icon: SplitSquareVertical },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/accounts", label: "Accounts", icon: PlugZap },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
