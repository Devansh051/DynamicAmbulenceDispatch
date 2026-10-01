import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Siren,
  Ambulance,
  Building2,
  Settings,
  Menu,
  X,
  Clock,
  Radio,
  Users,
  UserCheck,
  User,
  LogOut,
  Map
} from 'lucide-react';
import ConnectionBadge from '../components/ConnectionBadge';

export const MainLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toTimeString().split(' ')[0]);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Build role-aware navigation items
  const getNavItems = () => {
    switch (role) {
      case 'ADMIN':
        return [
          { to: '/', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/emergencies', label: 'Emergencies', icon: Siren },
          { to: '/ambulances', label: 'Fleet Ambulances', icon: Ambulance },
          { to: '/hospitals', label: 'Hospital Network', icon: Building2 },
          { to: '/zones', label: 'Service Zones', icon: Map },
          { to: '/admin/users', label: 'User Management', icon: Users },
          { to: '/admin/approvals', label: 'Account Approvals', icon: UserCheck },
          { to: '/profile', label: 'Profile & Security', icon: User },
          { to: '/settings', label: 'Settings', icon: Settings }
        ];
      case 'AMBULANCE_CREW':
        return [
          { to: '/', label: 'Crew Dashboard', icon: LayoutDashboard },
          { to: '/ambulances', label: 'Fleet Operations', icon: Ambulance },
          { to: '/profile', label: 'Profile & Security', icon: User }
        ];
      case 'HOSPITAL_OPERATOR':
        return [
          { to: '/', label: 'Hospital Operations', icon: LayoutDashboard },
          { to: '/hospitals', label: 'Hospital Network', icon: Building2 },
          { to: '/profile', label: 'Profile & Security', icon: User }
        ];
      case 'DISPATCHER':
      default:
        return [
          { to: '/', label: 'Dispatcher Command', icon: LayoutDashboard },
          { to: '/emergencies', label: 'Emergencies', icon: Siren },
          { to: '/ambulances', label: 'Ambulances', icon: Ambulance },
          { to: '/hospitals', label: 'Hospitals', icon: Building2 },
          { to: '/zones', label: 'Service Zones', icon: Map },
          { to: '/profile', label: 'Profile & Security', icon: User }
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <div className="flex h-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 flex-col bg-[#0F172A] border-r border-slate-800">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800 bg-[#0B1120]">
          <div className="w-9 h-9 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-500 flex items-center justify-center font-bold">
            <Radio className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide text-white flex items-center gap-1.5">
              EMS DISPATCH
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono border border-blue-700/50">
                PHASE 4
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">COMMAND CENTER</div>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Operational Footer info */}
        <div className="p-4 border-t border-slate-800 bg-[#0B1120]/50 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">ROLE:</span>
            <span className="font-mono text-amber-400 font-semibold">{role || 'OPERATOR'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">SYSTEM MODE:</span>
            <span className="font-mono text-emerald-400 font-semibold">RBAC ACTIVE</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Command Bar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-[#0F172A] border-b border-slate-800">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Title / Status */}
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Dynamic Ambulance Dispatch Platform
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Emergency Routing, Fleet Allocation & Hospital Network
              </p>
            </div>
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Live Clock */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentTime}</span>
            </div>

            {/* Health & DB Connection Indicator */}
            <ConnectionBadge />

            {/* Authenticated User Badge & Profile Link */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors"
                  title="View Profile & Security"
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold flex items-center justify-center text-xs">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="hidden xl:block text-left text-xs">
                    <div className="font-semibold text-white leading-tight max-w-[120px] truncate">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-blue-400 font-mono">{user.role}</div>
                  </div>
                </Link>

                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0F172A] border-b border-slate-800 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#0B0F19]">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
