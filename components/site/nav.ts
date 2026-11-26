import { Camera, Play, Swords, Trophy, type LucideIcon } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Main menu, in the order it appears everywhere. */
export const NAV_LINKS: NavLink[] = [
  { href: "/play", label: "Play", icon: Play },
  { href: "/versus", label: "Versus", icon: Swords },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/contribute", label: "Contribute", icon: Camera },
];

export const CREDITS_HREF = "/credits";
export const PINEAPPLE_URL = "https://pineapplehacks.com/";
export const GITHUB_URL = "https://github.com/PineappleLTD/blueguessr";

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
