"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarItem {
  href: string;
  label: string;
  icon?: string;
}

interface SidebarProps {
  items: SidebarItem[];
  title?: string;
}

export function Sidebar({ items, title }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-48 border-r border-border bg-surface">
      {title && (
        <div className="px-3 py-2 text-xs text-muted uppercase tracking-wider">
          [ {title} ]
        </div>
      )}
      <nav className="flex flex-col">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-3 py-1.5 text-sm transition-colors
                ${isActive
                  ? "bg-accent-muted text-accent border-l-2 border-accent"
                  : "text-foreground hover:bg-border"
                }
              `}
            >
              {item.icon && <span className="mr-2">{item.icon}</span>}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
