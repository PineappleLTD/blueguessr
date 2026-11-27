"use client";

import { usePathname } from "next/navigation";
import { NavList } from "./NavList";

/** The header's links, with the current page highlighted. */
export default function HeaderNav() {
  return <NavList pathname={usePathname()} />;
}
