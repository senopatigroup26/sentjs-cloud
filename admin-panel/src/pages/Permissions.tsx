import { useEffect, useState, useCallback } from 'react';
import { permissionsApi } from '../lib/api';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { toast } from '../components/Toast';
import './Page.css';

interface Permission {
  id: string;
  user_name: string;
  user_email: string;
  machine_name: string;
  file_name: string | null;
  local_path: string | null;
  action: string;
  status: string;
  request_reason: string | null;
  deny_reason: string | null;
  expires_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
  used_count: number;
  max_uses: number | null;
}

const Permissions = () => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [denyModal, setDenyModal] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [approveModal, setApproveModal] = useState<string | null>(null);
  const [approveOpts, setApproveOpts] = useState({ expires_at: '', max_uses: '' });

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await permissionsApi.list(params);
      setPermissions(res.data.data ?? []);
    } catch {
      toast.error('Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const handleApprove = async () => {
    if (!approveModal) return;
    try {
      const opts: Record<string, unknown> = {};
      if (approveOpts.expires_at) opts.expires_at = approveOpts.expires_at;
      if (approveOpts.max_uses)   opts.max_uses = parseInt(approveOpts.max_uses);
      await permissionsApi.approve(approveModal, opts);
      toast.success('Permission approved');
      setApproveModal(null);
      fetchPermissions();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to approve');
    }
  };

  const handleDeny = async () => {
    if (!denyModal) return;
    try {
      await permissionsApi.deny(denyModal, denyReason);
      toast.success('Permission denied');
      setDenyModal(null);
      setDenyReason('');
      fetchPermissions();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to deny');
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { approved: 'badge-green', denied: 'badge-red', pending: 'badge-orange', expired: 'badge-gray', revoked: 'badge-gray' };
    const icons: Record<string, React.ReactNode> = { approved: <CheckCircle size={11} />, denied: <XCircle size={11} />, pending: <Clock size={11} /> };
    return <span className={`badge ${map[s] ?? 'badge-gray'}`}>{icons[s]}{s}</span>;
  };

  const actionBadge = (a: string) => {
    const color: Record<string, string> = { usb: 'badge-red', export: 'badge-orange', copy: 'badge-blue', print: 'badge-gray', screenshot: 'badge-purple' };
    return <span className={`badge ${color[a] ?? 'badge-gray'}`}>{a}</span>;
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Permissions</h1>
          <p>Approve or deny file access requests</p>
        </div>
        <button className="btn-primary" onClick={fetchPermissions}><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="filter-tabs">
        {['pending', 'approved', 'denied', 'all'].map((tab) => (
          <button key={tab} className={`tab-btn ${statusFilter === tab ? 'active' : ''}`} onClick={() => setStatusFilter(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading permissions...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Device</th>
                <th>Action</th>
                <th>File</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {permissions.length === 0 ? (
                <tr><td colSpan={9} className="empty-row">No {statusFilter === 'all' ? '' : statusFilter} permissions found</td></tr>
              ) : (
                permissions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.user_name}</strong>
                      <div className="sub-text">{p.user_email}</div>
                    </td>
                    <td className="small">{p.machine_name}</td>
                    <td>{actionBadge(p.action)}</td>
                    <td>
                      {p.file_name ? (
                        <>
                          <span className="mono small">{p.file_name}</span>
                          {p.local_path && <div className="sub-text">{p.local_path}</div>}
                        </>
                      ) : <span className="small" style={{ color: '#aaa' }}>Any file</span>}
                    </td>
                    <td className="reason-cell">{p.request_reason || '—'}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td className="small">{fmt(p.requested_at)}</td>
                    <td className="small">{fmt(p.expires_at)}</td>
                    <td>
                      {p.status === 'pending' && (
                        <div className="action-buttons">
                          <button className="btn-icon btn-success" title="Approve" onClick={() => { setApproveModal(p.id); setApproveOpts({ expires_at: '', max_uses: '' }); }}>
                            <CheckCircle size={15} />
                          </button>
                          <button className="btn-icon btn-danger" title="Deny" onClick={() => { setDenyModal(p.id); setDenyReason(''); }}>
                            <XCircle size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2>Approve Permission</h2>
              <button className="close-btn" onClick={() => setApproveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Expires At (optional)</label>
                  <input type="datetime-local" value={approveOpts.expires_at} onChange={(e) => setApproveOpts({ ...approveOpts, expires_at: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Max Uses (optional)</label>
                  <input type="number" min={1} value={approveOpts.max_uses} onChange={(e) => setApproveOpts({ ...approveOpts, max_uses: e.target.value })} placeholder="Unlimited" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setApproveModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleApprove}>Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Modal */}
      {denyModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2>Deny Permission</h2>
              <button className="close-btn" onClick={() => setDenyModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Reason (optional)</label>
                <textarea rows={3} value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="Enter reason..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDenyModal(null)}>Cancel</button>
              <button className="btn-danger-solid" onClick={handleDeny}>Deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Permissions;
