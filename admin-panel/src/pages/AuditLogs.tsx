import { useEffect, useState, useCallback } from 'react';
import { auditApi } from '../lib/api';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from '../components/Toast';
import './Page.css';

interface AuditLog {
  id: string;
  action: string;
  severity: string;
  user_name: string | null;
  user_email: string | null;
  machine_name: string | null;
  ip_address: string | null;
  detail_json: Record<string, unknown> | null;
  created_at: string;
}

const severityBadge = (s: string) => {
  const map: Record<string, string> = { info: 'badge-blue', warning: 'badge-orange', critical: 'badge-red' };
  return <span className={`badge ${map[s] ?? 'badge-gray'}`}>{s}</span>;
};

const actionColor = (a: string) => {
  if (/delete|deny|block|suspend/i.test(a)) return 'badge-red';
  if (/create|approve|upload|success/i.test(a)) return 'badge-green';
  if (/login|auth|register/i.test(a)) return 'badge-blue';
  if (/warn|policy|usb/i.test(a)) return 'badge-orange';
  return 'badge-gray';
};

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (actionFilter)   params.action = actionFilter;
      if (severityFilter) params.severity = severityFilter;
      const res = await auditApi.list(params);
      setLogs(res.data.data ?? []);
      setTotal(res.data.meta?.pagination?.total ?? 0);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, severityFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filteredLogs = search
    ? logs.filter((l) =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.machine_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.ip_address?.includes(search)
      )
    : logs;

  const totalPages = Math.ceil(total / pageSize);
  const fmt = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Audit Logs</h1>
          <p>Track all system activity and security events</p>
        </div>
        <button className="btn-primary" onClick={fetchLogs}><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            placeholder="Filter by action, user, device, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}>
          <option value="">All Severity</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select className="filter-select" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="DEVICE_REGISTERED">Device Register</option>
          <option value="FILE_UPLOADED">File Upload</option>
          <option value="FILE_DEHYDRATED">File Dehydrated</option>
          <option value="PERMISSION_REQUESTED">Permission Request</option>
          <option value="PERMISSION_APPROVED">Permission Approved</option>
          <option value="PERMISSION_DENIED">Permission Denied</option>
          <option value="USB_BLOCKED">USB Blocked</option>
          <option value="MIGRATION_STARTED">Migration Started</option>
          <option value="DEVICE_SUSPENDED">Device Suspended</option>
          <option value="ADMIN_USER_CREATED">User Created</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading audit logs...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Severity</th>
                  <th>User</th>
                  <th>Device</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={7} className="empty-row">No logs found</td></tr>
                ) : (
                  filteredLogs.map((log) => (
                    <>
                      <tr key={log.id} style={{ cursor: log.detail_json ? 'pointer' : 'default' }} onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                        <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{fmt(log.created_at)}</td>
                        <td><span className={`badge ${actionColor(log.action)}`}>{log.action.replace(/_/g, ' ')}</span></td>
                        <td>{severityBadge(log.severity)}</td>
                        <td>
                          {log.user_name ? (
                            <>
                              <strong>{log.user_name}</strong>
                              <div className="sub-text">{log.user_email}</div>
                            </>
                          ) : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                        <td className="small">{log.machine_name || '—'}</td>
                        <td className="mono small">{log.ip_address || '—'}</td>
                        <td>
                          {log.detail_json && (
                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}>
                              {expandedId === log.id ? 'Hide' : 'Show'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === log.id && log.detail_json && (
                        <tr key={`${log.id}-detail`}>
                          <td colSpan={7} style={{ background: '#1a1a2e', padding: '12px 20px' }}>
                            <pre style={{ color: '#4fd1c5', fontSize: 12, margin: 0, overflowX: 'auto' }}>
                              {JSON.stringify(log.detail_json, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="page-info">Page {page} of {totalPages} ({total} total)</span>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogs;
