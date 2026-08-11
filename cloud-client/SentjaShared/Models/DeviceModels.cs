using System.Text.Json.Serialization;

namespace SentjaShared.Models;

public class Device
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string MachineName { get; set; } = string.Empty;
    public string MachineId { get; set; } = string.Empty;
    public string OsVersion { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? LastSeen { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class HardwareSnapshot
{
    [JsonPropertyName("cpu_id")]
    public string? CpuId { get; set; }
    
    [JsonPropertyName("cpu_name")]
    public string? CpuName { get; set; }
    
    [JsonPropertyName("motherboard_serial")]
    public string? MotherboardSerial { get; set; }
    
    [JsonPropertyName("motherboard_manufacturer")]
    public string? MotherboardManufacturer { get; set; }
    
    [JsonPropertyName("motherboard_product")]
    public string? MotherboardProduct { get; set; }
    
    [JsonPropertyName("bios_serial")]
    public string? BiosSerial { get; set; }
    
    [JsonPropertyName("bios_version")]
    public string? BiosVersion { get; set; }
    
    [JsonPropertyName("disk_serial")]
    public string? DiskSerial { get; set; }
    
    [JsonPropertyName("mac_addresses")]
    public List<string>? MacAddresses { get; set; }
    
    [JsonPropertyName("total_ram_mb")]
    public long TotalRamMb { get; set; }
    
    [JsonPropertyName("os_install_date")]
    public string? OsInstallDate { get; set; }
}

public class DeviceHeartbeatRequest
{
    public string Status { get; set; } = "online";
    public Dictionary<string, object>? SystemInfo { get; set; }
}

public class DevicePolicy
{
    public string DeviceId { get; set; } = string.Empty;
    public bool AllowUsb { get; set; }
    public bool AllowCopy { get; set; }
    public bool AllowExport { get; set; }
    public bool RequirePermission { get; set; }
    public List<string> BlockedPaths { get; set; } = new();
    public Dictionary<string, object>? AdditionalRules { get; set; }
}
