import { useEffect, useState, useCallback } from 'react';
import { devicesApi, migrationApi } from '../lib/api';
import { Monitor, Wifi, WifiOff, RefreshCw, Settings, ChevronDown, ChevronRight, BarChart2 } from 'lucide-react';
import { toast } from '../components/Toast';
import './Page.css';

interface Device {
  id: string;
  machine_name: string;
  machine_id: string;
  os_version: string;
  last_ip: string;
  status: string;
  last_seen_at: string;
  registered_at: string;
  user_name: string;
  user_email: string;
  total_files: number;
  synced_files: number;
  migration_phase: string | null;
  migration_progress: number | null;
  usb_policy: string;
}

interface Policy {
  usb_policy: 'allow' | 'block' | 'ask';
  allow_known_devices: boolean;
  status: 'active' | 'suspended' | 'decommissioned';
}

const defaultPolicy: Policy = { usb_policy: 'block', allow_known_devices: false, status: 'active' };

const Devices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Device | null>(null);
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [migrationData, setMigrationData] = useState<Record<string, any>>({});

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await devicesApi.list({ limit: 100 });
      setDevices(res.data.data ?? []);
    } catch {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const openPolicy = async (device: Device) => {
    setSelected(device);
    try {
      const res = await devicesApi.get(device.id);
      const d = res.data.data;
      setPolicy({
        usb_policy: d.usb_policy ?? 'block',
        allow_known_devices: d.allow_known_devices ?? false,
        status: d.status ?? 'active',
      });
    } catch {
      setPolicy(defaultPolicy);
    }
    setShowModal(true);
  };

  const savePolicy = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await devicesApi.updatePolicy(selected.id, policy);
      toast.success('Policy updated');
      setShowModal(false);
      fetchDevices();
    } catch {
      toast.error('Failed to update policy');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = async (device: Device) => {
    if (expandedId === device.id) { setExpandedId(null); return; }
    setExpandedId(device.id);
    if (!migrationData[device.id]) {
      try {
        const res = await migrationApi.status(device.id);
        setMigrationData(prev => ({ ...prev, [device.id]: res.data.data }));
      } catch {
        setMigrationData(prev => ({ ...prev, [device.id]: null }));
      }
    }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Devices</h1>
          <p>Manage connected client machines</p>
        </div>
        <button className="btn-primary" onClick={fetchDevices}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading devices...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Machine</th>
                <th>User</th>
                <th>OS</th>
                <th>IP</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Files</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr><td colSpan={9} className="empty-row">No devices registered</td></tr>
              ) : (
                devices.map((d) => (
                  <>
                    <tr key={d.id}>
                      <td>
                        <button className="btn-icon" onClick={() => toggleExpand(d)} title="Details">
                          {expandedId === d.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td>
                        <div className="device-name">
                          <Monitor size={15} />
                          <strong>{d.machine_name}</strong>
                        </div>
                      </td>
                      <td>
                        <div>{d.user_name}</div>
                        <div className="sub-text">{d.user_email}</div>
                      </td>
                      <td className="small">{d.os_version || '—'}</td>
                      <td className="mono small">{d.last_ip || '—'}</td>
                      <td>
                        <span className={`badge ${d.status === 'active' ? 'badge-green' : d.status === 'suspended' ? 'badge-red' : 'badge-gray'}`}>
                          {d.status === 'active' ? <Wifi size={11} /> : <WifiOff size={11} />}
                          {d.status}
                        </span>
                      </td>
                      <td className="small">{formatDate(d.last_seen_at)}</td>
                      <td>
                        <span className="small">{d.synced_files ?? 0}/{d.total_files ?? 0}</span>
                        {d.migration_phase && (
                          <div className="sub-text">{d.migration_phase}</div>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn-icon" onClick={() => openPolicy(d)} title="Edit Policy">
                            <Settings size={15} />
                          </button>
                          <button className="btn-icon" onClick={() => toggleExpand(d)} title="Migration Status">
                            <BarChart2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === d.id && (
                      <tr key={`${d.id}-expand`} className="expand-row">
                        <td colSpan={9}>
                          <div className="expand-content">
                            <div className="expand-section">
                              <strong>Machine ID</strong>
                              <span className="mono">{d.machine_id}</span>
                            </div>
                            <div className="expand-section">
                              <strong>Registered</strong>
                              <span>{formatDate(d.registered_at)}</span>
                            </div>
                            <div className="expand-section">
                              <strong>USB Policy</strong>
                              <span className={`badge ${d.usb_policy === 'allow' ? 'badge-green' : d.usb_policy === 'ask' ? 'badge-orange' : 'badge-red'}`}>
                                {d.usb_policy ?? 'block'}
                              </span>
                            </div>
                            <div className="expand-section">
                              <strong>Migration</strong>
                              {migrationData[d.id] === undefined ? (
                                <span className="small">Loading...</span>
                              ) : migrationData[d.id] === null || !migrationData[d.id]?.has_active_config ? (
                                <span className="small" style={{ color: '#aaa' }}>No active migration</span>
                              ) : (
                                <div className="migration-info">
                                  <span className="badge badge-blue">{migrationData[d.id].current_phase}</span>
                                  <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${migrationData[d.id].progress_percent ?? 0}%` }} />
                                  </div>
                                  <span className="small">{migrationData[d.id].progress_percent ?? 0}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && selected && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Policy — {selected.machine_name}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Device Status */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Device Status</label>
                <select value={policy.status} onChange={(e) => setPolicy({ ...policy, status: e.target.value as Policy['status'] })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="decommissioned">Decommissioned</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>USB Policy</label>
                <select value={policy.usb_policy} onChange={(e) => setPolicy({ ...policy, usb_policy: e.target.value as Policy['usb_policy'] })}>
                  <option value="block">Block (default)</option>
                  <option value="ask">Ask Permission</option>
                  <option value="allow">Allow</option>
                </select>
              </div>

              <div className="policy-grid">
                <div className="policy-item">
                  <div className="policy-info">
                    <strong>Allow Known USB Devices</strong>
                    <small>Allow USB devices that have been pre-approved</small>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={policy.allow_known_devices} onChange={(e) => setPolicy({ ...policy, allow_known_devices: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={savePolicy} disabled={saving}>
                {saving ? 'Saving...' : 'Save Policy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Devices;
