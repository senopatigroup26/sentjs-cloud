using System.Text.Json.Serialization;

namespace SentjaShared.Models;

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;
    
    [JsonPropertyName("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty;
    
    [JsonPropertyName("expires_in")]
    public int ExpiresIn { get; set; }
    
    [JsonPropertyName("token_type")]
    public string TokenType { get; set; } = string.Empty;
    
    public UserInfo User { get; set; } = new();
}

public class DeviceRegisterRequest
{
    [JsonPropertyName("machine_name")]
    public string MachineName { get; set; } = string.Empty;
    
    [JsonPropertyName("machine_id")]
    public string MachineId { get; set; } = string.Empty;
    
    [JsonPropertyName("os_version")]
    public string OsVersion { get; set; } = string.Empty;
    
    [JsonPropertyName("ip_address")]
    public string? IpAddress { get; set; }
    
    [JsonPropertyName("hardware_snapshot")]
    public HardwareSnapshot? HardwareSnapshot { get; set; }
}

public class DeviceRegisterResponse
{
    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;
    
    [JsonPropertyName("device_token")]
    public string DeviceToken { get; set; } = string.Empty;
    
    [JsonPropertyName("hardware_fingerprint")]
    public string? HardwareFingerprint { get; set; }
    
    public string Status { get; set; } = string.Empty;
}

public class RefreshTokenRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public class UserInfo
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class TokenInfo
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string DeviceToken { get; set; } = string.Empty;
}
