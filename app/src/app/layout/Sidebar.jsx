import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Shirt,
  Building2,
  QrCode,
  ScanLine,
  Layers,
  ShieldCheck,
  FileBarChart,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMe } from '@/auth/useMe';

const NAV = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/products', label: 'Products', icon: Shirt },
      { to: '/partners', label: 'Business partners', icon: Building2 },
      { to: '/dpps', label: 'DPPs', icon: QrCode },
      // Public token-entry page (lookup.html → ConsumerApp's TokenEntry form). It is a
      // separate, unauthenticated HTML entry point, so this is a plain link (new tab),
      // not an in-app NavLink route.
      { href: '/lookup.html', label: 'Open passport (QR token)', icon: ScanLine, external: true },
      { to: '/boms', label: 'Bill of materials', icon: Layers }
    ]
  },
  {
    heading: 'Compliance',
    items: [
      { to: '/validation', label: 'Validation', icon: ShieldCheck },
      { to: '/reports', label: 'Reports', icon: FileBarChart }
    ]
  },
  {
    heading: 'System',
    // User management lives here — visible to company_advanced only.
    items: [{ to: '/settings', label: 'Settings', icon: Settings, adminOnly: true }]
  }
];

export function Sidebar() {
  const { data: me } = useMe();
  const isAdvanced = me?.role === 'company_advanced';
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-black/5 bg-card">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
          O
        </span>
        <span className="text-base font-semibold text-ink">DPP Studio</span>
      </div>

      <nav className="flex-1 space-y-6 px-3 py-2">
        {NAV.map((group, i) => {
          const items = group.items.filter((it) => !it.adminOnly || isAdvanced);
          if (items.length === 0) return null;
          return (
          <div key={i}>
            {group.heading && (
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {group.heading}
              </p>
            )}
            <ul className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const rowBase =
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
                const inactive = 'text-ink-muted hover:bg-gray-100 hover:text-ink';

                if (item.external) {
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(rowBase, inactive)}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        {item.label}
                      </a>
                    </li>
                  );
                }

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(rowBase, isActive ? 'bg-brand-100 text-brand-800' : inactive)
                      }
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>
    </aside>
  );
}
