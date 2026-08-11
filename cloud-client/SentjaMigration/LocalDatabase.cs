using Microsoft.Data.Sqlite;
using SentjaShared.Config;
using SentjaShared.Models;

namespace SentjaMigration;

/// <summary>
/// Local SQLite database for tracking files, cache, and migration status
/// </summary>
public class LocalDatabase : IDisposable
{
    private readonly string _dbPath;
    private SqliteConnection? _connection;

    public LocalDatabase()
    {
        _dbPath = AppConfig.Instance.LocalDbPath;
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        var directory = Path.GetDirectoryName(_dbPath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _connection = new SqliteConnection($"Data Source={_dbPath}");
        _connection.Open();

        CreateTables();
    }

    private void CreateTables()
    {
        var sql = @"
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                remote_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                mime_type TEXT,
                status TEXT NOT NULL,
                last_modified TEXT,
                is_cached INTEGER DEFAULT 0,
                cache_path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS migration_status (
                device_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                total_files INTEGER DEFAULT 0,
                processed_files INTEGER DEFAULT 0,
                total_bytes INTEGER DEFAULT 0,
                processed_bytes INTEGER DEFAULT 0,
                failed_files INTEGER DEFAULT 0,
                current_file TEXT,
                started_at TEXT,
                completed_at TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS migration_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                local_path TEXT NOT NULL,
                remote_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                hash TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                processed_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cache_entries (
                file_id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                last_access TEXT DEFAULT CURRENT_TIMESTAMP,
                access_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path);
            CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
            CREATE INDEX IF NOT EXISTS idx_migration_files_status ON migration_files(status);
            CREATE INDEX IF NOT EXISTS idx_cache_last_access ON cache_entries(last_access);
        ";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    #region File Operations

    public void InsertFile(CloudFile file, bool isCached = false, string? cachePath = null)
    {
        var sql = @"
            INSERT OR REPLACE INTO files 
            (id, file_name, file_path, remote_path, file_size, file_hash, mime_type, status, last_modified, is_cached, cache_path)
            VALUES (@id, @fileName, @filePath, @remotePath, @fileSize, @fileHash, @mimeType, @status, @lastModified, @isCached, @cachePath)
        ";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@id", file.Id);
        command.Parameters.AddWithValue("@fileName", file.FileName);
        command.Parameters.AddWithValue("@filePath", file.FilePath);
        command.Parameters.AddWithValue("@remotePath", file.RemotePath);
        command.Parameters.AddWithValue("@fileSize", file.FileSize);
        command.Parameters.AddWithValue("@fileHash", file.FileHash);
        command.Parameters.AddWithValue("@mimeType", file.MimeType ?? "");
        command.Parameters.AddWithValue("@status", file.Status);
        command.Parameters.AddWithValue("@lastModified", file.LastModified?.ToString("o") ?? "");
        command.Parameters.AddWithValue("@isCached", isCached ? 1 : 0);
        command.Parameters.AddWithValue("@cachePath", cachePath ?? "");
        command.ExecuteNonQuery();
    }

    public CloudFile? GetFile(string fileId)
    {
        var sql = "SELECT * FROM files WHERE id = @id";
        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@id", fileId);

        using var reader = command.ExecuteReader();
        if (reader.Read())
        {
            return new CloudFile
            {
                Id = reader.GetString(0),
                FileName = reader.GetString(1),
                FilePath = reader.GetString(2),
                RemotePath = reader.GetString(3),
                FileSize = reader.GetInt64(4),
                FileHash = reader.GetString(5),
                MimeType = reader.GetString(6),
                Status = reader.GetString(7),
                LastModified = string.IsNullOrEmpty(reader.GetString(8)) ? null : DateTime.Parse(reader.GetString(8))
            };
        }

        return null;
    }

    public List<CloudFile> GetAllFiles()
    {
        var files = new List<CloudFile>();
        var sql = "SELECT * FROM files ORDER BY file_path";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            files.Add(new CloudFile
            {
                Id = reader.GetString(0),
                FileName = reader.GetString(1),
                FilePath = reader.GetString(2),
                RemotePath = reader.GetString(3),
                FileSize = reader.GetInt64(4),
                FileHash = reader.GetString(5),
                MimeType = reader.GetString(6),
                Status = reader.GetString(7),
                LastModified = string.IsNullOrEmpty(reader.GetString(8)) ? null : DateTime.Parse(reader.GetString(8))
            });
        }

        return files;
    }

    public void UpdateFileCache(string fileId, bool isCached, string? cachePath)
    {
        var sql = "UPDATE files SET is_cached = @isCached, cache_path = @cachePath WHERE id = @id";
        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@id", fileId);
        command.Parameters.AddWithValue("@isCached", isCached ? 1 : 0);
        command.Parameters.AddWithValue("@cachePath", cachePath ?? "");
        command.ExecuteNonQuery();
    }

    #endregion

    #region Migration Operations

    public void InsertMigrationStatus(MigrationStatus status)
    {
        var sql = @"
            INSERT OR REPLACE INTO migration_status 
            (device_id, status, total_files, processed_files, total_bytes, processed_bytes, failed_files, current_file, started_at, completed_at, updated_at)
            VALUES (@deviceId, @status, @totalFiles, @processedFiles, @totalBytes, @processedBytes, @failedFiles, @currentFile, @startedAt, @completedAt, @updatedAt)
        ";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@deviceId", status.DeviceId);
        command.Parameters.AddWithValue("@status", status.Status);
        command.Parameters.AddWithValue("@totalFiles", status.TotalFiles);
        command.Parameters.AddWithValue("@processedFiles", status.ProcessedFiles);
        command.Parameters.AddWithValue("@totalBytes", status.TotalBytes);
        command.Parameters.AddWithValue("@processedBytes", status.ProcessedBytes);
        command.Parameters.AddWithValue("@failedFiles", status.FailedFiles);
        command.Parameters.AddWithValue("@currentFile", status.CurrentFile ?? "");
        command.Parameters.AddWithValue("@startedAt", status.StartedAt?.ToString("o") ?? "");
        command.Parameters.AddWithValue("@completedAt", status.CompletedAt?.ToString("o") ?? "");
        command.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
        command.ExecuteNonQuery();
    }

    public MigrationStatus? GetMigrationStatus(string deviceId)
    {
        var sql = "SELECT * FROM migration_status WHERE device_id = @deviceId";
        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@deviceId", deviceId);

        using var reader = command.ExecuteReader();
        if (reader.Read())
        {
            return new MigrationStatus
            {
                DeviceId = reader.GetString(0),
                Status = reader.GetString(1),
                TotalFiles = reader.GetInt32(2),
                ProcessedFiles = reader.GetInt32(3),
                TotalBytes = reader.GetInt64(4),
                ProcessedBytes = reader.GetInt64(5),
                FailedFiles = reader.GetInt32(6),
                CurrentFile = reader.GetString(7),
                StartedAt = string.IsNullOrEmpty(reader.GetString(8)) ? null : DateTime.Parse(reader.GetString(8)),
                CompletedAt = string.IsNullOrEmpty(reader.GetString(9)) ? null : DateTime.Parse(reader.GetString(9))
            };
        }

        return null;
    }

    public void InsertMigrationFile(MigrationFileEntry entry)
    {
        var sql = @"
            INSERT INTO migration_files (local_path, remote_path, size, hash, status, error, processed_at)
            VALUES (@localPath, @remotePath, @size, @hash, @status, @error, @processedAt)
        ";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@localPath", entry.LocalPath);
        command.Parameters.AddWithValue("@remotePath", entry.RemotePath);
        command.Parameters.AddWithValue("@size", entry.Size);
        command.Parameters.AddWithValue("@hash", entry.Hash);
        command.Parameters.AddWithValue("@status", entry.Status);
        command.Parameters.AddWithValue("@error", entry.Error ?? "");
        command.Parameters.AddWithValue("@processedAt", entry.ProcessedAt?.ToString("o") ?? "");
        command.ExecuteNonQuery();
    }

    #endregion

    #region Cache Operations

    public void RecordCacheAccess(string fileId, string filePath, long size)
    {
        var sql = @"
            INSERT OR REPLACE INTO cache_entries (file_id, file_path, size, last_access, access_count)
            VALUES (@fileId, @filePath, @size, @lastAccess, 
                    COALESCE((SELECT access_count FROM cache_entries WHERE file_id = @fileId), 0) + 1)
        ";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@fileId", fileId);
        command.Parameters.AddWithValue("@filePath", filePath);
        command.Parameters.AddWithValue("@size", size);
        command.Parameters.AddWithValue("@lastAccess", DateTime.UtcNow.ToString("o"));
        command.ExecuteNonQuery();
    }

    public List<(string FileId, DateTime LastAccess)> GetLRUCacheEntries(int limit = 100)
    {
        var entries = new List<(string, DateTime)>();
        var sql = "SELECT file_id, last_access FROM cache_entries ORDER BY last_access ASC LIMIT @limit";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@limit", limit);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            entries.Add((reader.GetString(0), DateTime.Parse(reader.GetString(1))));
        }

        return entries;
    }

    public void RemoveCacheEntry(string fileId)
    {
        var sql = "DELETE FROM cache_entries WHERE file_id = @fileId";
        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@fileId", fileId);
        command.ExecuteNonQuery();
    }

    #endregion

    #region Stats

    public (int total, int synced, int pending, long totalBytes, long syncedBytes) GetFileSyncStats()
    {
        var sql = @"
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN status != 'synced' THEN 1 ELSE 0 END) as pending,
                SUM(file_size) as total_bytes,
                SUM(CASE WHEN status = 'synced' THEN file_size ELSE 0 END) as synced_bytes
            FROM files";

        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        using var reader = command.ExecuteReader();
        if (reader.Read())
        {
            return (
                reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                reader.IsDBNull(1) ? 0 : reader.GetInt32(1),
                reader.IsDBNull(2) ? 0 : reader.GetInt32(2),
                reader.IsDBNull(3) ? 0 : reader.GetInt64(3),
                reader.IsDBNull(4) ? 0 : reader.GetInt64(4)
            );
        }
        return (0, 0, 0, 0, 0);
    }

    public List<(string name, long size, string status, string path)> GetRecentFiles(int limit = 10)
    {
        var result = new List<(string, long, string, string)>();
        var sql = "SELECT file_name, file_size, status, file_path FROM files ORDER BY created_at DESC LIMIT @limit";
        using var command = _connection!.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@limit", limit);
        using var reader = command.ExecuteReader();
        while (reader.Read())
            result.Add((reader.GetString(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3)));
        return result;
    }

    #endregion

    public void Dispose()
    {
        _connection?.Close();
        _connection?.Dispose();
        GC.SuppressFinalize(this);
    }
}
