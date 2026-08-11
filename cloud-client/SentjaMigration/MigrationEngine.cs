using System.Security.Cryptography;
using Renci.SshNet;
using SentjaShared.ApiClient;
using SentjaShared.Models;

namespace SentjaMigration;

/// <summary>
/// Handles initial folder migration to cloud storage
/// SCAN → HASH → UPLOAD → VERIFY → MARK AS CLOUD → DEHYDRATE
/// </summary>
public class MigrationEngine
{
    private readonly SentjaApiClient _apiClient;
    private readonly LocalDatabase _database;
    private readonly string _deviceId;
    private readonly SftpConfig _sftpConfig;
    private CancellationTokenSource? _cancellationTokenSource;

    public event EventHandler<MigrationProgress>? ProgressChanged;

    public MigrationEngine(
        SentjaApiClient apiClient,
        LocalDatabase database,
        string deviceId,
        SftpConfig sftpConfig)
    {
        _apiClient = apiClient;
        _database = database;
        _deviceId = deviceId;
        _sftpConfig = sftpConfig;
    }

    public async Task<bool> StartMigrationAsync(MigrationConfig config)
    {
        _cancellationTokenSource = new CancellationTokenSource();

        try
        {
            // Initialize migration status
            var status = new MigrationStatus
            {
                DeviceId = _deviceId,
                Status = "scanning",
                StartedAt = DateTime.UtcNow
            };
            _database.InsertMigrationStatus(status);

            // Phase 1: Scan folders
            var filesToMigrate = await ScanFoldersAsync(config.FoldersToMigrate);
            if (filesToMigrate.Count == 0)
            {
                status.Status = "completed";
                status.CompletedAt = DateTime.UtcNow;
                _database.InsertMigrationStatus(status);
                return true;
            }

            status.TotalFiles = filesToMigrate.Count;
            status.TotalBytes = filesToMigrate.Sum(f => f.Size);
            status.Status = "uploading";
            _database.InsertMigrationStatus(status);

            // Phase 2: Upload files
            var success = await UploadFilesAsync(filesToMigrate, config, _cancellationTokenSource.Token);

            // Phase 3: Complete migration
            status.Status = success ? "completed" : "failed";
            status.CompletedAt = DateTime.UtcNow;
            _database.InsertMigrationStatus(status);

            return success;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Migration failed: {ex.Message}");
            var status = _database.GetMigrationStatus(_deviceId);
            if (status != null)
            {
                status.Status = "failed";
                status.CompletedAt = DateTime.UtcNow;
                _database.InsertMigrationStatus(status);
            }
            return false;
        }
    }

    public void CancelMigration()
    {
        _cancellationTokenSource?.Cancel();
    }

    private async Task<List<MigrationFileEntry>> ScanFoldersAsync(List<string> folders)
    {
        var files = new List<MigrationFileEntry>();

        foreach (var folder in folders)
        {
            if (!Directory.Exists(folder))
            {
                Console.WriteLine($"Folder not found: {folder}");
                continue;
            }

            var folderFiles = Directory.GetFiles(folder, "*", SearchOption.AllDirectories);
            foreach (var filePath in folderFiles)
            {
                try
                {
                    var fileInfo = new FileInfo(filePath);
                    var relativePath = Path.GetRelativePath(folder, filePath);
                    var remotePath = $"/users/{_deviceId}/{relativePath.Replace('\\', '/')}";

                    files.Add(new MigrationFileEntry
                    {
                        LocalPath = filePath,
                        RemotePath = remotePath,
                        Size = fileInfo.Length,
                        Hash = "", // Will be calculated during upload
                        Status = "pending"
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to scan file {filePath}: {ex.Message}");
                }
            }
        }

        return files;
    }

    private async Task<bool> UploadFilesAsync(
        List<MigrationFileEntry> files,
        MigrationConfig config,
        CancellationToken cancellationToken)
    {
        var semaphore = new SemaphoreSlim(config.MaxConcurrentUploads);
        var tasks = new List<Task<bool>>();

        foreach (var file in files)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            await semaphore.WaitAsync(cancellationToken);

            var task = Task.Run(async () =>
            {
                try
                {
                    return await UploadFileAsync(file, config.VerifyBeforeDelete, cancellationToken);
                }
                finally
                {
                    semaphore.Release();
                }
            }, cancellationToken);

            tasks.Add(task);
        }

        var results = await Task.WhenAll(tasks);
        return results.All(r => r);
    }

    private async Task<bool> UploadFileAsync(
        MigrationFileEntry file,
        bool verifyBeforeDelete,
        CancellationToken cancellationToken)
    {
        try
        {
            // Update status
            var status = _database.GetMigrationStatus(_deviceId);
            if (status != null)
            {
                status.CurrentFile = file.LocalPath;
                _database.InsertMigrationStatus(status);
            }

            ProgressChanged?.Invoke(this, new MigrationProgress
            {
                CurrentFile = file.LocalPath,
                ProcessedFiles = status?.ProcessedFiles ?? 0,
                TotalFiles = status?.TotalFiles ?? 0
            });

            // Step 1: Calculate hash
            file.Hash = await CalculateFileHashAsync(file.LocalPath, cancellationToken);

            // Step 2: Upload to SFTP
            await UploadToSftpAsync(file.LocalPath, file.RemotePath, cancellationToken);

            // Step 3: Verify upload
            if (verifyBeforeDelete)
            {
                var verified = await VerifyUploadAsync(file.RemotePath, file.Hash, cancellationToken);
                if (!verified)
                {
                    file.Status = "failed";
                    file.Error = "Verification failed";
                    _database.InsertMigrationFile(file);
                    return false;
                }
            }

            // Step 4: Notify backend
            var uploadCompleteRequest = new FileUploadCompleteRequest
            {
                DeviceId = _deviceId,
                FileName = Path.GetFileName(file.LocalPath),
                FilePath = file.LocalPath,
                RemotePath = file.RemotePath,
                FileSize = file.Size,
                FileHash = file.Hash,
                MimeType = GetMimeType(file.LocalPath)
            };

            var response = await _apiClient.CompleteUploadAsync(uploadCompleteRequest);
            if (!response.Success)
            {
                file.Status = "failed";
                file.Error = response.Error;
                _database.InsertMigrationFile(file);
                return false;
            }

            // Step 5: Mark as cloud and dehydrate local file
            if (response.Data != null)
            {
                _database.InsertFile(response.Data, false, null);
            }

            // Step 6: Delete local file (now that it's safely in cloud)
            if (verifyBeforeDelete)
            {
                File.Delete(file.LocalPath);
            }

            file.Status = "completed";
            file.ProcessedAt = DateTime.UtcNow;
            _database.InsertMigrationFile(file);

            // Update migration status
            if (status != null)
            {
                status.ProcessedFiles++;
                status.ProcessedBytes += file.Size;
                _database.InsertMigrationStatus(status);
            }

            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to upload {file.LocalPath}: {ex.Message}");
            file.Status = "failed";
            file.Error = ex.Message;
            _database.InsertMigrationFile(file);

            var status = _database.GetMigrationStatus(_deviceId);
            if (status != null)
            {
                status.FailedFiles++;
                _database.InsertMigrationStatus(status);
            }

            return false;
        }
    }

    private async Task<string> CalculateFileHashAsync(string filePath, CancellationToken cancellationToken)
    {
        using var sha256 = SHA256.Create();
        using var stream = File.OpenRead(filePath);
        var hashBytes = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hashBytes).ToLower();
    }

    private async Task UploadToSftpAsync(string localPath, string remotePath, CancellationToken cancellationToken)
    {
        await Task.Run(() =>
        {
            using var client = new SftpClient(_sftpConfig.Host, _sftpConfig.Port, _sftpConfig.Username, _sftpConfig.Password);
            client.Connect();

            try
            {
                // Create remote directory if needed
                var remoteDir = Path.GetDirectoryName(remotePath)?.Replace('\\', '/');
                if (!string.IsNullOrEmpty(remoteDir))
                {
                    CreateRemoteDirectory(client, remoteDir);
                }

                // Upload file
                using var fileStream = File.OpenRead(localPath);
                client.UploadFile(fileStream, remotePath);
            }
            finally
            {
                client.Disconnect();
            }
        }, cancellationToken);
    }

    private void CreateRemoteDirectory(SftpClient client, string path)
    {
        var parts = path.Split('/');
        var currentPath = "";

        foreach (var part in parts)
        {
            if (string.IsNullOrEmpty(part)) continue;

            currentPath += "/" + part;
            if (!client.Exists(currentPath))
            {
                client.CreateDirectory(currentPath);
            }
        }
    }

    private async Task<bool> VerifyUploadAsync(string remotePath, string expectedHash, CancellationToken cancellationToken)
    {
        return await Task.Run(() =>
        {
            using var client = new SftpClient(_sftpConfig.Host, _sftpConfig.Port, _sftpConfig.Username, _sftpConfig.Password);
            client.Connect();

            try
            {
                if (!client.Exists(remotePath))
                {
                    return false;
                }

                // Download and calculate hash
                using var memoryStream = new MemoryStream();
                client.DownloadFile(remotePath, memoryStream);
                memoryStream.Position = 0;

                using var sha256 = SHA256.Create();
                var hashBytes = sha256.ComputeHash(memoryStream);
                var actualHash = Convert.ToHexString(hashBytes).ToLower();

                return actualHash == expectedHash;
            }
            finally
            {
                client.Disconnect();
            }
        }, cancellationToken);
    }

    private string GetMimeType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLower();
        return extension switch
        {
            ".txt" => "text/plain",
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".zip" => "application/zip",
            _ => "application/octet-stream"
        };
    }
}

public class SftpConfig
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 22;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class MigrationProgress
{
    public string CurrentFile { get; set; } = string.Empty;
    public int ProcessedFiles { get; set; }
    public int TotalFiles { get; set; }
    public double Percentage => TotalFiles > 0 ? (double)ProcessedFiles / TotalFiles * 100 : 0;
}
