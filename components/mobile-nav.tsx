"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/components/nav-items";
import { cn } from "@/lib/utils";

// Phone-sized screens (< 768px) have no sidebar, so this drawer carries every menu item.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-white hover:bg-ink-800"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />

          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-ink-900 px-3 py-6">
            <div className="flex items-center justify-between px-3">
              <span className="font-display text-lg font-medium">Yoinsta</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-ink-800 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors",
                      active
                        ? "bg-ink-800 text-white"
                        : "text-muted hover:bg-ink-800 hover:text-white"
                    )}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-2 flex items-center gap-3 rounded-md px-3 py-3 text-sm text-red-400 hover:bg-red-500/10"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
