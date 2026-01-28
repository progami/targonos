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
} from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/templates", label: "Templates", icon: ShieldCheck },
  { href: "/orders", label: "Orders", icon: PackageSearch },
  { href: "/messaging", label: "Messaging", icon: MessagesSquare },
  { href: "/accounts", label: "Accounts", icon: PlugZap },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const quickStats = [
  { label: "Review rate", value: "4.8%" },
  { label: "Last 24h sends", value: "312" },
  { label: "Ineligible", value: "18" },
  { label: "Throttled", value: "7" },
  { label: "Avg delay", value: "8.2d" },
  { label: "Lift", value: "+0.6pp" },
] as const;
