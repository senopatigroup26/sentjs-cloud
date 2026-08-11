namespace SentjaShared.Models;

public class Permission
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string FileId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PermissionRequestRequest
{
    public string FileId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string? Destination { get; set; }
}

public class PermissionCheckRequest
{
    public string FileId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
}

public class PermissionCheckResponse
{
    public bool Allowed { get; set; }
    public string? PermissionId { get; set; }
    public string? Reason { get; set; }
}
