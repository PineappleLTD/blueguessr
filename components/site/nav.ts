import { Trophy, type LucideIcon } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Main menu, in the order it appears everywhere. */
export const NAV_LINKS: NavLink[] = [{ href: "/leaderboard", label: "Leaderboard", icon: Trophy }];

export const CREDITS_HREF = "/credits";
export const PINEAPPLE_URL = "https://pineapplehacks.com/";

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
