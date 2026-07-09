import { useState } from 'react'; // Added useState
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Shirt,
  Building2,
  QrCode,
  ScanLine,
  Layers,
  Megaphone,
  ShieldCheck,
  ShieldAlert,
  FileBarChart,
  Settings,
  FileUp,
  FileText,
  Activity,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMe } from '@/auth/useMe';

const NAV = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/assistant', label: 'DPP Assistant', icon: Sparkles },
      { to: '/products', label: 'Products', icon: Shirt },
      { to: '/partners', label: 'Business partners', icon: Building2 },
      { to: '/dpps', label: 'DPPs', icon: QrCode },
      { to: '/marketing', label: 'Marketing', icon: Megaphone, adminOnly: true },
      { href: '/lookup.html', label: 'Open passport (QR token)', icon: ScanLine, external: true },
      { to: '/boms', label: 'Bill of materials', icon: Layers },
      { to: '/import', label: 'Import', icon: FileUp, adminOnly: true },
    ]
  },
  {
    heading: 'Compliance',
    items: [
      { to: '/validation', label: 'Validation', icon: ShieldCheck },
      { to: '/reports', label: 'Reports', icon: FileBarChart, adminOnly: true },
      { to: '/compliance', label: 'Warnings', icon: ShieldAlert }
    ]
  },
  {
    heading: 'System',
    items: [
      { to: '/settings', label: 'Administrative Settings', icon: Settings, adminOnly: true },
      { to: '/activity-logs', label: 'Activity Logs', icon: Activity, adminOnly: true }
    ]
  }
];

// business_partner logins are locked to their portal — the sidebar shows only that.
const PARTNER_NAV = [
  {
    items: [{ to: '/partner-documents', label: 'My documents', icon: FileText }]
  }
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true); // State to manage open/close
  const { data: me } = useMe();
  const isAdvanced = me?.role === 'company_advanced';
  const nav = me?.role === 'business_partner' ? PARTNER_NAV : NAV;

  return (
    <aside 
      className={cn(
        "flex shrink-0 flex-col border-r border-black/5 bg-card transition-all duration-300",
        isOpen ? "w-64" : "w-16" // Changes width based on state
      )}
    >
      {/* Header Area */}
      <div className={cn("flex h-16 items-center gap-2 px-4", isOpen ? "justify-between" : "justify-center")}>
        {isOpen && (
          <div className="flex items-center gap-2 overflow-hidden animate-fade-in">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
              O
            </span>
            <span className="text-base font-semibold text-ink whitespace-nowrap">DPP Studio</span>
          </div>
        )}
        
        {/* Toggle Button */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-md p-1.5 hover:bg-gray-100 text-ink-muted hover:text-ink transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-3 py-2 overflow-y-auto overflow-x-hidden">
        {nav.map((group, i) => {
          const items = group.items.filter((it) => !it.adminOnly || isAdvanced);
          if (items.length === 0) return null;
          return (
            <div key={i}>
              {group.heading && isOpen && (
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted whitespace-nowrap">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const rowBase = 'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full';
                  const inactive = 'text-ink-muted hover:bg-gray-100 hover:text-ink';

                  // Dynamic layout spacing based on sidebar state
                  const contentLayout = cn(
                    "flex items-center w-full",
                    isOpen ? "gap-3" : "justify-center"
                  );

                  if (item.external) {
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(rowBase, inactive)}
                          title={!isOpen ? item.label : undefined} // Tooltip when collapsed
                        >
                          <div className={contentLayout}>
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            {isOpen && <span className="truncate">{item.label}</span>}
                          </div>
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
                        title={!isOpen ? item.label : undefined} // Tooltip when collapsed
                      >
                        <div className={contentLayout}>
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {isOpen && <span className="truncate">{item.label}</span>}
                        </div>
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