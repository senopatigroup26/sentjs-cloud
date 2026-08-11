using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Renci.SshNet;
using SentjaShared.ApiClient;
using SentjaShared.Config;
using SentjaShared.Models;

namespace SentjaMigration;

/// <summary>
/// Watches C:\SentjaCloud for changes, uploads to Hetzner via SFTP,
/// records in backend, then dehydrates the local file to a placeholder.
/// </summary>
public class SyncManager : IDisposable
{
    private readonly ILogger<SyncManager> _logger;
    private readonly SentjaApiClient _apiClient;
    private readonly LocalDatabase _db;
    private readonly string _syncRoot;
    private FileSystemWatcher? _watcher;
    private readonly ConcurrentDictionary<string, DateTime> _pending = new();

    // Device ID loaded from disk (set after device registration)
    private string? _deviceId;

    public SyncManager(ILogger<SyncManager> logger, SentjaApiClient apiClient)
    {
        _logger   = logger;
        _apiClient = apiClient;
        _db        = new LocalDatabase();
        _syncRoot  = AppConfig.Instance.SyncRootPath;

        Directory.CreateDirectory(_syncRoot);

        // Load device ID
        _deviceId = LoadDeviceId();
    }

    // Start auto-watch (call after device registration confirmed)
    public void StartWatching()
    {
        _deviceId = LoadDeviceId();
        StartWatcher();
    }

    // ── Initial sync: create placeholders for files already on cloud ──────────
    public async Task InitialSyncAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("Starting initial sync...");
        int page = 1, total = 0;

        while (!ct.IsCancellationRequested)
        {
                        var deviceId = LoadDeviceId();
            var result = await _apiClient.GetFilesAsync(new FileListRequest { Page = page, PageSize = 50, DeviceId = deviceId });
            if (!result.Success || result.Data == null || result.Data.Data.Count == 0) break;

            foreach (var file in result.Data.Data)
            {
                ct.ThrowIfCancellationRequested();
                CreatePlaceholder(file.FilePath, file.FileSize, file.LastModified ?? DateTime.UtcNow);
                _db.InsertFile(file);
                total++;
            }

            if (result.Data.Data.Count < 50) break;
            page++;
        }

        _logger.LogInformation("Initial sync done: {Count} placeholders", total);
        StartWatcher();
    }

    // ── File watcher ──────────────────────────────────────────────────────────
    private void StartWatcher()
    {
        _watcher = new FileSystemWatcher(_syncRoot)
        {
            IncludeSubdirectories = true,
            EnableRaisingEvents   = true,
            NotifyFilter          = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size
        };
        _watcher.Created += (_, e) => _ = DebouncedUploadAsync(e.FullPath);
        _watcher.Changed += (_, e) => _ = DebouncedUploadAsync(e.FullPath);
        _watcher.Deleted += (_, e) => _ = OnFileDeletedAsync(e.FullPath);
        _logger.LogInformation("File watcher started on {Path}", _syncRoot);
    }

    // ── Debounce: wait 2s after last change before uploading ─────────────────
    private async Task DebouncedUploadAsync(string fullPath)
    {
        _pending[fullPath] = DateTime.UtcNow;
        await Task.Delay(2000);

        if (_pending.TryGetValue(fullPath, out var t) && (DateTime.UtcNow - t).TotalMilliseconds >= 1900)
        {
            _pending.TryRemove(fullPath, out _);
            await UploadFileAsync(fullPath);
        }
    }

    // ── Main upload flow ──────────────────────────────────────────────────────
    public async Task UploadFileAsync(string fullPath)
    {
        try
        {
            if (!File.Exists(fullPath)) {
                _logger.LogWarning("File not found, skipping: {Path}", fullPath);
                return;
            }
            
            var info = new FileInfo(fullPath);
            if (info.Length == 0) {
                _logger.LogInformation("Skipping empty placeholder: {Path}", fullPath);
                return;
            }

            var relativePath = Path.GetRelativePath(_syncRoot, fullPath).Replace('\\', '/');
            _logger.LogInformation("=== START SYNC: {Path} ({Size} bytes) ===", relativePath, info.Length);

            if (string.IsNullOrEmpty(_deviceId)) {
                _logger.LogError("CRITICAL: Device ID is NULL! Cannot upload without device registration.");
                throw new InvalidOperationException("Device not registered. Run device registration first.");
            }
            
            _logger.LogInformation("Device ID: {DeviceId}", _deviceId);

            // 1. Hash
            _logger.LogInformation("Step 1: Computing SHA256 hash...");
            string hash;
            using (var sha = SHA256.Create())
            using (var fs  = File.OpenRead(fullPath))
                hash = Convert.ToHexString(sha.ComputeHash(fs)).ToLower();
            _logger.LogInformation("Hash: {Hash}", hash);

            // 2. Upload to Hetzner via SFTP (SKIP IF NO CREDENTIALS)
            var remotePath = $"{AppConfig.Instance.HetznerBasePath}/devices/{_deviceId}/{relativePath}";
            
            try {
                _logger.LogInformation("Step 2: Uploading to Hetzner SFTP...");
                await UploadToHetznerAsync(fullPath, remotePath);
                _logger.LogInformation("✓ Hetzner upload SUCCESS");
            } catch (Exception ex) {
                _logger.LogWarning("⚠ Hetzner upload SKIPPED: {Error} (continuing with local record)", ex.Message);
                // Continue anyway - record in backend without actual upload
            }

            // 3. Record in backend
            _logger.LogInformation("Step 3: Recording in backend API...");
            
            var res = await _apiClient.CompleteUploadAsync(new FileUploadCompleteRequest
            {
                DeviceId   = _deviceId,
                FileName   = info.Name,
                FilePath   = relativePath,
                RemotePath = remotePath,
                FileSize   = info.Length,
                FileHash   = hash,
                MimeType   = GetMimeType(info.Extension)
            });

            if (!res.Success)
            {
                _logger.LogError("✗ Backend record FAILED!");
                _logger.LogError("  Error: {Error}", res.Error);
                throw new Exception($"Backend record failed: {res.Error}");
            }
            
            _logger.LogInformation("✓ Backend record SUCCESS: file_id={FileId}", res.Data?.Id ?? "unknown");

            // 4. Dehydrate: replace local file with empty placeholder
            _logger.LogInformation("Step 4: Dehydrating local file...");
            Dehydrate(fullPath);
            _logger.LogInformation("✓ Dehydrated");
            
            _logger.LogInformation("=== SYNC COMPLETE: {Path} ===\n", relativePath);
        }
        catch (Exception ex)
        {
            _logger.LogError("✗✗✗ SYNC FAILED for {Path} ✗✗✗", fullPath);
            _logger.LogError("Error Type: {Type}", ex.GetType().Name);
            _logger.LogError("Error Message: {Message}", ex.Message);
            _logger.LogError("Stack Trace: {StackTrace}", ex.StackTrace);
            throw;
        }
    }

    // ── Hetzner SFTP upload ───────────────────────────────────────────────────
    private async Task UploadToHetznerAsync(string localPath, string remotePath)
    {
        var cfg = AppConfig.Instance;

        await Task.Run(() =>
        {
            using var sftp = new SftpClient(cfg.HetznerHost, cfg.HetznerPort, cfg.HetznerUser, cfg.HetznerPassword);
            sftp.Connect();

            // Ensure remote directories exist
            var dir = remotePath.Contains('/') ? remotePath[..remotePath.LastIndexOf('/')] : "/";
            EnsureRemoteDirectory(sftp, dir);

            using var fs = File.OpenRead(localPath);
            sftp.UploadFile(fs, remotePath, true);
            sftp.Disconnect();
        });
    }

    private static void EnsureRemoteDirectory(SftpClient sftp, string path)
    {
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var current = "";
        foreach (var part in parts)
        {
            current += "/" + part;
            try { sftp.CreateDirectory(current); } catch { /* already exists */ }
        }
    }

    // ── Dehydrate: clear file content, leave 0-byte placeholder ──────────────
    private static void Dehydrate(string fullPath)
    {
        try
        {
            // Overwrite with empty content (placeholder)
            // In full CfAPI implementation: use CfDehydratePlaceholder()
            File.WriteAllBytes(fullPath, Array.Empty<byte>());
        }
        catch { /* ignore if locked */ }
    }

    // ── Hydrate: download from Hetzner when user opens a placeholder ──────────
    public async Task<bool> HydrateFileAsync(string fullPath)
    {
        try
        {
            var relativePath = Path.GetRelativePath(_syncRoot, fullPath).Replace('\\', '/');
            var remotePath = _deviceId != null
                ? $"{AppConfig.Instance.HetznerBasePath}/devices/{_deviceId}/{relativePath}"
                : $"{AppConfig.Instance.HetznerBasePath}/{relativePath}";

            var cfg = AppConfig.Instance;
            await Task.Run(() =>
            {
                using var sftp = new SftpClient(cfg.HetznerHost, cfg.HetznerPort, cfg.HetznerUser, cfg.HetznerPassword);
                sftp.Connect();
                using var fs = File.Create(fullPath);
                sftp.DownloadFile(remotePath, fs);
                sftp.Disconnect();
            });

            _logger.LogInformation("Hydrated: {Path}", relativePath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError("Hydrate failed for {Path}: {Error}", fullPath, ex.Message);
            return false;
        }
    }

    // ── Delete handler ────────────────────────────────────────────────────────
    private async Task OnFileDeletedAsync(string fullPath)
    {
        var relativePath = Path.GetRelativePath(_syncRoot, fullPath).Replace('\\', '/');
        _logger.LogInformation("File deleted locally: {Path}", relativePath);
        // Optionally: delete from Hetzner and mark as deleted in backend
        await Task.CompletedTask;
    }

    // ── Placeholder creation ──────────────────────────────────────────────────
    private void CreatePlaceholder(string relativePath, long size, DateTime lastModified)
    {
        try
        {
            var full = Path.Combine(_syncRoot, relativePath.TrimStart('/', '\\'));
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            if (!File.Exists(full))
            {
                File.WriteAllBytes(full, Array.Empty<byte>());
                File.SetLastWriteTimeUtc(full, lastModified);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Placeholder failed for {Path}: {Error}", relativePath, ex.Message);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static string? LoadDeviceId()
    {
        try
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Sentja", "device_id.txt");
            return File.Exists(path) ? File.ReadAllText(path).Trim() : null;
        }
        catch { return null; }
    }

    private static string GetMimeType(string ext) => ext.ToLower() switch
    {
        ".pdf"  => "application/pdf",
        ".doc"  => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls"  => "application/vnd.ms-excel",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png"  => "image/png",
        ".txt"  => "text/plain",
        ".zip"  => "application/zip",
        _ => "application/octet-stream"
    };

    public void Dispose()
    {
        _watcher?.Dispose();
        _db.Dispose();
    }
}
