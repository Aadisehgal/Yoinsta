import {
  LayoutDashboard,
  Video,
  Search,
  Flame,
  Gauge,
  Users,
  Sparkles,
  Lightbulb,
  Image as ImageIcon,
  Instagram,
  Settings,
} from "lucide-react";

// Single source of truth for the menu — used by the desktop sidebar and the mobile drawer.
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/videos", label: "Videos", icon: Video },
  { href: "/dashboard/keywords", label: "Keywords", icon: Search },
  { href: "/dashboard/outliers", label: "Outliers", icon: Flame },
  { href: "/dashboard/seo", label: "SEO Tools", icon: Gauge },
  { href: "/dashboard/competitors", label: "Competitors", icon: Users },
  { href: "/dashboard/ai-tools", label: "AI Tools", icon: Sparkles },
  { href: "/dashboard/ideas", label: "Daily Ideas", icon: Lightbulb },
  { href: "/dashboard/thumbnails", label: "Thumbnails", icon: ImageIcon },
  { href: "/dashboard/instagram", label: "Instagram", icon: Instagram },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Highlights a menu item for its own page and any page below it (e.g. /dashboard/videos/abc123). */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
