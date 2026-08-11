import { useEffect, useState } from 'react';
import { dashboardApi } from '../lib/api';
import { Monitor, Shield, AlertCircle, Database, Users, HardDrive } from 'lucide-react';
import { toast } from '../components/Toast';
import './Dashboard.css';

interface DashboardData {
  total_users: number;
  total_devices: number;
  devices_by_status: Record<string, number>;
  total_files_synced: number;
  total_storage_bytes: number;
  active_migrations: number;
  pending_permissions: number;
  usb_blocks_today: number;
  recent_logs: Array<{
    action: string;
    severity: string;
    created_at: string;
    ip_address: string;
    user_name: string;
    machine_name: string;
  }>;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const severityColor: Record<string, string> = {
  info: 'badge-blue',
  warning: 'badge-orange',
  critical: 'badge-red',
};

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.stats()
      .then((res) => setData(res.data.data))
      .catch(() => toast.error('Failed to load dashboard stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!data)   return <div className="loading">No data available</div>;

  const cards = [
    { label: 'Active Users',        value: data.total_users,          icon: Users,       color: '#667eea' },
    { label: 'Total Devices',       value: data.total_devices,        icon: Monitor,     color: '#48bb78' },
    { label: 'Files Synced',        value: data.total_files_synced,   icon: Database,    color: '#4fd1c5' },
    { label: 'Storage Used',        value: formatBytes(data.total_storage_bytes), icon: HardDrive, color: '#ed8936' },
    { label: 'Pending Permissions', value: data.pending_permissions,  icon: Shield,      color: '#f6ad55' },
    { label: 'USB Blocks Today',    value: data.usb_blocks_today,     icon: AlertCircle, color: '#f56565' },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your Sentja Cloud infrastructure</p>
      </div>

      <div className="stats-grid">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: `${color}18` }}>
              <Icon size={22} color={color} />
            </div>
            <div>
              <p className="stat-label">{label}</p>
              <p className="stat-value">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-row">
        {/* Device Status */}
        <div className="dash-card">
          <h2>Device Status</h2>
          <div className="device-status-list">
            {Object.entries(data.devices_by_status).map(([status, count]) => (
              <div key={status} className="status-row">
                <span className={`badge badge-${status === 'active' ? 'green' : status === 'suspended' ? 'red' : 'gray'}`}>
                  {status}
                </span>
                <span className="status-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dash-card dash-card-wide">
          <h2>Recent Activity</h2>
          {data.recent_logs.length === 0 ? (
            <p className="empty-text">No recent activity</p>
          ) : (
            <div className="activity-list">
              {data.recent_logs.map((log, i) => (
                <div key={i} className="activity-item">
                  <span className={`badge ${severityColor[log.severity] ?? 'badge-gray'}`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <span className="activity-meta">
                    {log.user_name || log.machine_name || log.ip_address}
                  </span>
                  <span className="activity-time">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
