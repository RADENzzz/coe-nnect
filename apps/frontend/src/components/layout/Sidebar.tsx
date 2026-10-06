import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import type { RoleNav } from '../../lib/constants/nav-config';

interface SidebarProps {
  nav: RoleNav;
}

export default function Sidebar({ nav }: SidebarProps) {
  const { deptName } = useDepartmentLabel();

  // Prefer the role-specific subtitle, but fall back to dept name for DH.
  const subtitle = nav.brandSubtitle === 'Department Portal' ? deptName : nav.brandSubtitle;

  return (
    <nav className="hidden md:flex flex-col h-screen w-64 bg-white border-r border-slate-200 fixed left-0 top-0 z-50">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#5c1219] flex items-center justify-center shrink-0">
            <Icon name="school" filled className="text-white" size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">
              CoE-NNECT
            </p>
            <p className="text-xs text-slate-500 truncate max-w-[160px]">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* CTA — only show for DH (has a "Term" concept) */}
      {nav.brandSubtitle === 'Department Portal' && (
        <div className="px-4 py-3 border-b border-slate-100">
          <button className="w-full bg-[#5c1219] text-white font-semibold text-sm py-2 hover:opacity-90 transition-colors flex items-center justify-center gap-2">
            <Icon name="add" />
            Create New Term
          </button>
        </div>
      )}

      {/* Main Nav */}
      <div className="flex-1 flex flex-col gap-px py-2 overflow-y-auto px-2">
        {nav.main.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-sm transition-colors'
                : 'flex items-center gap-3 px-3 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors'
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} filled={isActive} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer Nav */}
      {nav.footer.length > 0 && (
        <div className="flex flex-col gap-px py-2 border-t border-slate-100 px-2">
          {nav.footer.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-2.5 bg-[#5c1219] text-white font-semibold text-sm transition-colors'
                  : 'flex items-center gap-3 px-3 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors'
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}