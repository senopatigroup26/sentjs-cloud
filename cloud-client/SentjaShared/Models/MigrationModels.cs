namespace SentjaShared.Models;

public class MigrationConfig
{
    public string DeviceId { get; set; } = string.Empty;
    public List<string> FoldersToMigrate { get; set; } = new();
    public bool VerifyBeforeDelete { get; set; } = true;
    public int MaxConcurrentUploads { get; set; } = 3;
}

public class MigrationStatus
{
    public string DeviceId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int TotalFiles { get; set; }
    public int ProcessedFiles { get; set; }
    public long TotalBytes { get; set; }
    public long ProcessedBytes { get; set; }
    public int FailedFiles { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? CurrentFile { get; set; }
}

public class MigrationFileEntry
{
    public string LocalPath { get; set; } = string.Empty;
    public string RemotePath { get; set; } = string.Empty;
    public long Size { get; set; }
    public string Hash { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? ProcessedAt { get; set; }
    public string? Error { get; set; }
}
