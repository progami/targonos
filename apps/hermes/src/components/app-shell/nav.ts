import {
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  PackageSearch,
  Settings,
  ShieldCheck,
  ScrollText,
  PlugZap,
  Star,
} from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/templates", label: "Templates", icon: ShieldCheck },
  { href: "/orders", label: "Orders", icon: PackageSearch },
  { href: "/messaging", label: "Messaging", icon: MessagesSquare },
  { href: "/accounts", label: "Accounts", icon: PlugZap },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
