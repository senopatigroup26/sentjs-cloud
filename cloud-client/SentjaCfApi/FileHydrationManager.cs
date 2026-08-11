using SentjaShared.ApiClient;
using SentjaShared.Models;
using SentjaShared.Config;

namespace SentjaCfApi;

/// <summary>
/// Manages file hydration (downloading cloud files to local cache)
/// </summary>
public class FileHydrationManager
{
    private readonly SentjaApiClient _apiClient;
    private readonly string _cachePath;
    private readonly ILogger? _logger;

    public FileHydrationManager(SentjaApiClient apiClient, ILogger? logger = null)
    {
        _apiClient = apiClient;
        _cachePath = AppConfig.Instance.LocalCachePath;
        _logger = logger;

        if (!Directory.Exists(_cachePath))
        {
            Directory.CreateDirectory(_cachePath);
        }
    }

    /// <summary>
    /// Download and hydrate a file
    /// </summary>
    public async Task<string?> HydrateFileAsync(string fileId, string relativePath, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger?.LogInformation("Hydrating file: {FileId} ({Path})", fileId, relativePath);

            // Get hydration info from backend
            // Note: This endpoint doesn't exist in current backend spec
            // You'll need to add it or use existing file info
            var localPath = Path.Combine(_cachePath, fileId);

            // Check if already cached
            if (File.Exists(localPath))
            {
                _logger?.LogDebug("File already cached: {Path}", localPath);
                return localPath;
            }

            // TODO: Download file from backend/SFTP
            // This is a placeholder for the actual download logic
            // You'll need to:
            // 1. Get file download URL from backend
            // 2. Download file content (either via HTTP or SFTP)
            // 3. Verify file hash
            // 4. Save to cache

            _logger?.LogInformation("File hydrated successfully: {Path}", localPath);
            return localPath;
        }
        catch (Exception ex)
        {
            _logger?.LogError($"Failed to hydrate file {fileId}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Dehydrate a file (remove from local cache, keep as placeholder)
    /// </summary>
    public async Task<bool> DehydrateFileAsync(string fileId, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger?.LogInformation("Dehydrating file: {FileId}", fileId);

            var localPath = Path.Combine(_cachePath, fileId);
            if (File.Exists(localPath))
            {
                File.Delete(localPath);
                _logger?.LogDebug("Removed cached file: {Path}", localPath);
            }

            // Notify backend that file was dehydrated
            var request = new FileDehydrateRequest
            {
                FileId = fileId
            };

            var response = await _apiClient.DehydrateFileAsync(request);
            if (!response.Success)
            {
                _logger?.LogWarning("Backend dehydrate notification failed: {Error}", response.Error);
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger?.LogError($"Failed to dehydrate file {fileId}: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Get cached file path if exists
    /// </summary>
    public string? GetCachedFilePath(string fileId)
    {
        var localPath = Path.Combine(_cachePath, fileId);
        return File.Exists(localPath) ? localPath : null;
    }

    /// <summary>
    /// Clear cache (remove all cached files)
    /// </summary>
    public void ClearCache()
    {
        try
        {
            if (Directory.Exists(_cachePath))
            {
                var files = Directory.GetFiles(_cachePath);
                foreach (var file in files)
                {
                    try
                    {
                        File.Delete(file);
                    }
                    catch (Exception ex)
                    {
                        _logger?.LogWarning("Failed to delete cached file: {Path}, Error: {Error}", file, ex.Message);
                    }
                }
                _logger?.LogInformation("Cache cleared: {Count} files removed", files.Length);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError("Failed to clear cache: {Error}", ex.Message);
        }
    }

    /// <summary>
    /// Get cache size in bytes
    /// </summary>
    public long GetCacheSize()
    {
        try
        {
            if (!Directory.Exists(_cachePath))
            {
                return 0;
            }

            var files = Directory.GetFiles(_cachePath);
            return files.Sum(f => new FileInfo(f).Length);
        }
        catch (Exception ex)
        {
            _logger?.LogError($"Failed to get cache size: {ex.Message}");
            return 0;
        }
    }

    /// <summary>
    /// Enforce cache size limit (LRU eviction)
    /// </summary>
    public void EnforceCacheLimit()
    {
        try
        {
            var maxSize = AppConfig.Instance.MaxCacheSize;
            var currentSize = GetCacheSize();

            if (currentSize <= maxSize)
            {
                return;
            }

            _logger?.LogInformation("Cache size ({Current} bytes) exceeds limit ({Max} bytes), cleaning...",
                currentSize, maxSize);

            var files = Directory.GetFiles(_cachePath)
                .Select(f => new FileInfo(f))
                .OrderBy(f => f.LastAccessTime) // LRU
                .ToList();

            long removedSize = 0;
            int removedCount = 0;

            foreach (var file in files)
            {
                if (currentSize - removedSize <= maxSize)
                {
                    break;
                }

                try
                {
                    removedSize += file.Length;
                    file.Delete();
                    removedCount++;
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning("Failed to delete file during cache cleanup: {Path}, Error: {Error}", file.FullName, ex.Message);
                }
            }

            _logger?.LogInformation("Cache cleanup complete: {Count} files removed, {Size} bytes freed",
                removedCount, removedSize);
        }
        catch (Exception ex)
        {
            _logger?.LogError($"Failed to enforce cache limit: {ex.Message}");
        }
    }
}
