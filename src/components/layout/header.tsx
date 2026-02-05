"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/containers", label: "Containers" },
  { href: "/images", label: "Images" },
  { href: "/networks", label: "Networks" },
  { href: "/system", label: "System" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <header className="border-b border-border">
      <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-foreground">
          compoza
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                py-1 text-sm transition-colors border-b-2
                ${isActive(item.href)
                  ? "text-foreground border-foreground"
                  : "text-muted border-transparent hover:text-foreground"
                }
              `}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu button */}
        <button
          className="sm:hidden px-2 py-1 text-muted hover:text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav"
        >
          <span aria-hidden="true">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* Mobile nav */}
      {mobileMenuOpen && (
        <nav id="mobile-nav" className="sm:hidden border-t border-border">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`
                block px-4 py-3 text-sm transition-colors border-l-2
                ${isActive(item.href)
                  ? "text-foreground border-foreground bg-surface"
                  : "text-muted border-transparent hover:text-foreground hover:bg-surface"
                }
              `}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
