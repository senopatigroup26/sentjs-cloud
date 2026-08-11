import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  LayoutDashboard,
  Monitor,
  Users,
  Shield,
  FileText,
  FolderOpen,
  Settings,
  LogOut,
} from 'lucide-react';
import './Layout.css';

const nav = [
  { name: 'Dashboard',   path: '/',            icon: LayoutDashboard },
  { name: 'Devices',     path: '/devices',      icon: Monitor },
  { name: 'Users',       path: '/users',        icon: Users },
  { name: 'Files',       path: '/files',        icon: FolderOpen },
  { name: 'Permissions', path: '/permissions',  icon: Shield },
  { name: 'Audit Logs',  path: '/audit',        icon: FileText },
  { name: 'System',      path: '/system',       icon: Settings },
];

const Layout = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-logo">S</div>
          <div>
            <h1>Sentja Cloud</h1>
            <p className="subtitle">Admin Panel</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ name, path, icon: Icon }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);
            return (
              <Link key={path} to={path} className={`nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={18} />
                <span>{name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0)?.toUpperCase() ?? 'A'}</div>
            <div className="user-details">
              <p className="user-name">{user?.name ?? 'Admin'}</p>
              <p className="user-role">{user?.role ?? 'admin'}</p>
            </div>
          </div>
          <button onClick={logout} className="logout-btn">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
