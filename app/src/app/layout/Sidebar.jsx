import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Shirt,
  Building2,
  QrCode,
  ShieldCheck,
  FileBarChart,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/cn';

const NAV = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/products', label: 'Products', icon: Shirt },
      { to: '/partners', label: 'Business partners', icon: Building2 },
      { to: '/dpps', label: 'DPPs', icon: QrCode }
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
    items: [{ to: '/settings', label: 'Settings', icon: Settings }]
  }
];

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-black/5 bg-card">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
          O
        </span>
        <span className="text-base font-semibold text-ink">DPP Studio</span>
      </div>

      <nav className="flex-1 space-y-6 px-3 py-2">
        {NAV.map((group, i) => (
          <div key={i}>
            {group.heading && (
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {group.heading}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-100 text-brand-800'
                            : 'text-ink-muted hover:bg-gray-100 hover:text-ink'
                        )
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
        ))}
      </nav>
    </aside>
  );
}
