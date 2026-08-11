using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SentjaShared.Models;

namespace SentjaShared.Utils;

public static class HardwareCollector
{
    private static bool _wmiAvailable = false;
    
    static HardwareCollector()
    {
        // Check if System.Management is available
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            _wmiAvailable = type != null;
        }
        catch
        {
            _wmiAvailable = false;
        }
    }
    
    public static HardwareSnapshot CollectSnapshot()
    {
        var snapshot = new HardwareSnapshot
        {
            CpuId = GetCpuId(),
            CpuName = GetCpuName(),
            MotherboardSerial = GetMotherboardSerial(),
            MotherboardManufacturer = GetMotherboardManufacturer(),
            MotherboardProduct = GetMotherboardProduct(),
            BiosSerial = GetBiosSerial(),
            BiosVersion = GetBiosVersion(),
            DiskSerial = GetDiskSerial(),
            MacAddresses = GetMacAddresses(),
            TotalRamMb = GetTotalRamMb(),
            OsInstallDate = GetOsInstallDate()
        };
        
        return snapshot;
    }
    
    public static string GenerateFingerprint(HardwareSnapshot snapshot)
    {
        // Create normalized string from key hardware components
        var components = new[]
        {
            snapshot.CpuId ?? "",
            snapshot.MotherboardSerial ?? "",
            snapshot.BiosSerial ?? "",
            snapshot.DiskSerial ?? "",
            string.Join(",", snapshot.MacAddresses ?? new List<string>())
        };
        
        var normalized = string.Join("|", components.Where(c => !string.IsNullOrWhiteSpace(c)));
        
        // Generate SHA256 hash
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(normalized));
        return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
    }
    
    private static string? GetCpuId()
    {
        if (!_wmiAvailable) return GetMachineGuid();
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return GetMachineGuid();
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT ProcessorId FROM Win32_Processor")!;
            foreach (var obj in searcher.Get())
            {
                return obj["ProcessorId"]?.ToString();
            }
        }
        catch { }
        return GetMachineGuid();
    }
    
    private static string? GetCpuName()
    {
        if (!_wmiAvailable) return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER");
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER");
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT Name FROM Win32_Processor")!;
            foreach (var obj in searcher.Get())
            {
                return obj["Name"]?.ToString()?.Trim();
            }
        }
        catch { }
        return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER");
    }
    
    private static string? GetMotherboardSerial()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT SerialNumber FROM Win32_BaseBoard")!;
            foreach (var obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(serial) && serial != "None" && serial != "To Be Filled By O.E.M.")
                    return serial;
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetMotherboardManufacturer()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT Manufacturer FROM Win32_BaseBoard")!;
            foreach (var obj in searcher.Get())
            {
                return obj["Manufacturer"]?.ToString()?.Trim();
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetMotherboardProduct()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT Product FROM Win32_BaseBoard")!;
            foreach (var obj in searcher.Get())
            {
                return obj["Product"]?.ToString()?.Trim();
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetBiosSerial()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT SerialNumber FROM Win32_BIOS")!;
            foreach (var obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(serial) && serial != "Default string")
                    return serial;
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetBiosVersion()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT SMBIOSBIOSVersion FROM Win32_BIOS")!;
            foreach (var obj in searcher.Get())
            {
                return obj["SMBIOSBIOSVersion"]?.ToString()?.Trim();
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetDiskSerial()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT SerialNumber FROM Win32_PhysicalMedia")!;
            foreach (var obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(serial))
                    return serial;
            }
        }
        catch { }
        return null;
    }
    
    private static List<string> GetMacAddresses()
    {
        var addresses = new List<string>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                    ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                {
                    var mac = ni.GetPhysicalAddress().ToString();
                    if (!string.IsNullOrWhiteSpace(mac) && mac != "000000000000")
                    {
                        addresses.Add(mac);
                    }
                }
            }
        }
        catch { }
        return addresses.Distinct().ToList();
    }
    
    private static long GetTotalRamMb()
    {
        if (!_wmiAvailable)
        {
            // Fallback: try to get from Environment
            try
            {
                // This is not accurate but better than nothing
                return (long)(GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024));
            }
            catch { }
            return 0;
        }
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return 0;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT Capacity FROM Win32_PhysicalMemory")!;
            long totalBytes = 0;
            foreach (var obj in searcher.Get())
            {
                if (obj["Capacity"] != null)
                {
                    totalBytes += Convert.ToInt64(obj["Capacity"]);
                }
            }
            return totalBytes / (1024 * 1024); // Convert to MB
        }
        catch { }
        return 0;
    }
    
    private static string? GetOsInstallDate()
    {
        if (!_wmiAvailable) return null;
        
        try
        {
            var type = Type.GetType("System.Management.ManagementObjectSearcher, System.Management");
            if (type == null) return null;
            
            var converterType = Type.GetType("System.Management.ManagementDateTimeConverter, System.Management");
            if (converterType == null) return null;
            
            dynamic searcher = Activator.CreateInstance(type, "SELECT InstallDate FROM Win32_OperatingSystem")!;
            foreach (var obj in searcher.Get())
            {
                var installDate = obj["InstallDate"]?.ToString();
                if (!string.IsNullOrWhiteSpace(installDate))
                {
                    var method = converterType.GetMethod("ToDateTime", new[] { typeof(string) });
                    if (method != null)
                    {
                        var dt = (DateTime)method.Invoke(null, new object[] { installDate })!;
                        return dt.ToString("o");
                    }
                }
            }
        }
        catch { }
        return null;
    }
    
    private static string? GetMachineGuid()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            return key?.GetValue("MachineGuid")?.ToString();
        }
        catch { }
        return Environment.MachineName;
    }
}
