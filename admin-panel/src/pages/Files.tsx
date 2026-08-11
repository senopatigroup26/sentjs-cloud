import { useEffect, useState, useCallback } from 'react';
import { filesApi } from '../lib/api';
import { Download, RefreshCw, Search, CloudOff } from 'lucide-react';
import { toast } from '../components/Toast';
import './Page.css';

interface CloudFile {
  id: string;
  file_name: string;
  local_path: string;
  remote_path: string;
  size_bytes: number;
  mime_type: string | null;
  checksum_sha256: string | null;
  status: string;
  machine_name: string;
  user_name: string;
  last_modified_at: string | null;
  updated_at: string;
}

function formatBytes(b: number) {
  if (!b) return '—';
  const u = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

const statusColor: Record<string, string> = {
  synced: 'badge-green', cached: 'badge-blue', dehydrated: 'badge-gray',
  uploading: 'badge-orange', error: 'badge-red', pending: 'badge-gray',
};

const Files = () => {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await filesApi.list(params);
      setFiles(res.data.data ?? []);
      setTotal(res.data.meta?.pagination?.total ?? 0);
    } catch {
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDownload = (file: CloudFile) => {
    const url = filesApi.downloadUrl(file.id);
    window.open(url, '_blank');
    toast.success(`Downloading ${file.file_name}`);
  };

  const totalPages = Math.ceil(total / pageSize);
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cloud Files</h1>
          <p>Browse all files stored in Hetzner Storage Box</p>
        </div>
        <button className="btn-primary" onClick={fetchFiles}><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            placeholder="Search by file name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchFiles(); } }}
          />
        </div>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Status</option>
          <option value="synced">Synced</option>
          <option value="cached">Cached</option>
          <option value="dehydrated">Dehydrated</option>
          <option value="uploading">Uploading</option>
          <option value="error">Error</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading files...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Device / User</th>
                  <th>Size</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr><td colSpan={7} className="empty-row">No files found</td></tr>
                ) : (
                  files.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.file_name}</strong>
                        <div className="sub-text mono">{f.local_path}</div>
                      </td>
                      <td>
                        <div>{f.machine_name}</div>
                        <div className="sub-text">{f.user_name}</div>
                      </td>
                      <td className="small">{formatBytes(f.size_bytes)}</td>
                      <td className="small">{f.mime_type?.split('/')[1] ?? '—'}</td>
                      <td>
                        <span className={`badge ${statusColor[f.status] ?? 'badge-gray'}`}>
                          {f.status === 'dehydrated' && <CloudOff size={11} />}
                          {f.status}
                        </span>
                      </td>
                      <td className="small">{fmt(f.last_modified_at ?? f.updated_at)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-icon"
                            onClick={() => handleDownload(f)}
                            title="Download"
                            disabled={f.status === 'uploading'}
                          >
                            <Download size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="page-info">Page {page} of {totalPages} ({total} files)</span>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Files;
