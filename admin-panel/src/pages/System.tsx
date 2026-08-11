import { useEffect, useState } from 'react';
import { Server, Database, HardDrive, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import api from '../lib/api';
import './Page.css';
import './System.css';

interface SystemStatus {
  api: { status: string; version: string; environment: string };
  database: { status: string; type: string };
  storage: { provider: string; status: string; host: string; base_path: string; error?: string };
}

const System = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/system/status');
      if (res.data.success) setStatus(res.data.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const StatusBadge = ({ online }: { online: boolean }) => (
    <span className={`badge ${online ? 'badge-green' : 'badge-red'}`}>
      {online
        ? <><CheckCircle size={11} /> Online</>
        : <><XCircle size={11} /> Offline</>
      }
    </span>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>System Status</h1>
          <p>Monitor backend services and storage connectivity</p>
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {loading && <div className="loading">Checking system status...</div>}

      {!loading && !status && (
        <div className="empty-state">
          <XCircle size={40} color="#f56565" />
          <p>Failed to load system status. Backend may be offline.</p>
        </div>
      )}

      {!loading && status && (
        <>
          {/* Status Cards */}
          <div className="system-cards">

            {/* API */}
            <div className="system-card">
              <div className="system-card-header">
                <div className="system-card-icon" style={{ background: '#667eea18' }}>
                  <Server size={22} color="#667eea" />
                </div>
                <div>
                  <h3>API Server</h3>
                  <StatusBadge online={status.api.status === 'online'} />
                </div>
              </div>
              <div className="system-card-body">
                <div className="info-row">
                  <span>Version</span>
                  <strong>{status.api.version}</strong>
                </div>
                <div className="info-row">
                  <span>Environment</span>
                  <strong>{status.api.environment}</strong>
                </div>
              </div>
            </div>

            {/* Database */}
            <div className="system-card">
              <div className="system-card-header">
                <div className="system-card-icon" style={{ background: '#48bb7818' }}>
                  <Database size={22} color="#48bb78" />
                </div>
                <div>
                  <h3>Database</h3>
                  <StatusBadge online={status.database.status === 'online'} />
                </div>
              </div>
              <div className="system-card-body">
                <div className="info-row">
                  <span>Type</span>
                  <strong>{status.database.type}</strong>
                </div>
              </div>
            </div>

            {/* Hetzner Storage */}
            <div className="system-card">
              <div className="system-card-header">
                <div className="system-card-icon" style={{ background: '#ed893618' }}>
                  <HardDrive size={22} color="#ed8936" />
                </div>
                <div>
                  <h3>Hetzner Storage</h3>
                  <StatusBadge online={status.storage.status === 'online'} />
                </div>
              </div>
              <div className="system-card-body">
                <div className="info-row">
                  <span>Provider</span>
                  <strong>{status.storage.provider}</strong>
                </div>
                <div className="info-row">
                  <span>Host</span>
                  <strong className="mono small">{status.storage.host}</strong>
                </div>
                <div className="info-row">
                  <span>Base Path</span>
                  <strong className="mono">{status.storage.base_path}</strong>
                </div>
                {status.storage.error && (
                  <div className="error-box">
                    <XCircle size={13} />
                    {status.storage.error}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Summary Table */}
          <div className="table-container" style={{ marginTop: 24 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>API Server</strong></td>
                  <td>Node.js</td>
                  <td>v{status.api.version} — {status.api.environment}</td>
                  <td><StatusBadge online={status.api.status === 'online'} /></td>
                </tr>
                <tr>
                  <td><strong>Database</strong></td>
                  <td>{status.database.type}</td>
                  <td>sentja_db</td>
                  <td><StatusBadge online={status.database.status === 'online'} /></td>
                </tr>
                <tr>
                  <td><strong>Cloud Storage</strong></td>
                  <td>{status.storage.provider}</td>
                  <td>{status.storage.host}{status.storage.base_path}</td>
                  <td><StatusBadge online={status.storage.status === 'online'} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default System;
