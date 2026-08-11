using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SentjaShared.Config;
using SentjaShared.Models;

namespace SentjaShared.ApiClient;

public class SentjaApiClient
{
    private readonly HttpClient _httpClient;
    private TokenInfo? _tokenInfo;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    public SentjaApiClient()
    {
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(AppConfig.Instance.ApiBaseUrl)
        };
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "SentjaCloudClient/1.0");
    }

    public async Task<ApiResponse<LoginResponse>> LoginAsync(string email, string password)
    {
        try
        {
            var request = new
            {
                email = email,
                password = password
            };

            var response = await _httpClient.PostAsJsonAsync("/api/auth/login", request);
            
            // Read raw content for debugging
            var content = await response.Content.ReadAsStringAsync();
            
            if (!response.IsSuccessStatusCode)
            {
                // Try to parse error response
                try
                {
                    var errorResult = JsonSerializer.Deserialize<ApiResponse<LoginResponse>>(content);
                    return errorResult ?? new ApiResponse<LoginResponse> 
                    { 
                        Success = false, 
                        Error = $"HTTP {response.StatusCode}" 
                    };
                }
                catch
                {
                    return new ApiResponse<LoginResponse>
                    {
                        Success = false,
                        Error = $"HTTP {response.StatusCode}: {content}"
                    };
                }
            }
            
            var result = JsonSerializer.Deserialize<ApiResponse<LoginResponse>>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result?.Success == true && result.Data != null)
            {
                _tokenInfo = new TokenInfo
                {
                    AccessToken = result.Data.AccessToken,
                    RefreshToken = result.Data.RefreshToken,
                    ExpiresAt = DateTime.UtcNow.AddSeconds(result.Data.ExpiresIn)
                };
                UpdateAuthHeader();
            }

            return result ?? new ApiResponse<LoginResponse> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<LoginResponse>
            {
                Success = false,
                Error = $"Connection error: {ex.Message}"
            };
        }
    }

    public async Task<ApiResponse<DeviceRegisterResponse>> RegisterDeviceAsync(DeviceRegisterRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/auth/device-register", request);
            var result = await response.Content.ReadFromJsonAsync<ApiResponse<DeviceRegisterResponse>>();

            if (result?.Success == true && result.Data != null && _tokenInfo != null)
            {
                _tokenInfo.DeviceToken = result.Data.DeviceToken;
            }

            return result ?? new ApiResponse<DeviceRegisterResponse> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<DeviceRegisterResponse>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }
    
    public async Task<ApiResponse<DeviceRegisterResponse>> AutoRegisterDeviceAsync(DeviceRegisterRequest request)
    {
        try
        {
            // No auth required for auto-registration
            var response = await _httpClient.PostAsJsonAsync("/api/auth/device-auto-register", request);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                return new ApiResponse<DeviceRegisterResponse>
                {
                    Success = false,
                    Error = $"HTTP {(int)response.StatusCode}: {errorBody}"
                };
            }
            
            var result = await response.Content.ReadFromJsonAsync<ApiResponse<DeviceRegisterResponse>>();

            if (result?.Success == true && result.Data != null)
            {
                // Save token from auto-registration
                _tokenInfo = new TokenInfo
                {
                    AccessToken = result.Data.DeviceToken,
                    RefreshToken = result.Data.DeviceToken,
                    ExpiresAt = DateTime.UtcNow.AddYears(10), // Long-lived device token
                    DeviceToken = result.Data.DeviceToken
                };
                UpdateAuthHeader();
            }

            return result ?? new ApiResponse<DeviceRegisterResponse> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<DeviceRegisterResponse>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<LoginResponse>> RefreshTokenAsync()
    {
        try
        {
            if (_tokenInfo?.RefreshToken == null)
            {
                return new ApiResponse<LoginResponse>
                {
                    Success = false,
                    Error = "No refresh token available"
                };
            }

            var request = new RefreshTokenRequest
            {
                RefreshToken = _tokenInfo.RefreshToken
            };

            var response = await _httpClient.PostAsJsonAsync("/api/auth/refresh", request);
            var result = await response.Content.ReadFromJsonAsync<ApiResponse<LoginResponse>>();

            if (result?.Success == true && result.Data != null)
            {
                _tokenInfo.AccessToken = result.Data.AccessToken;
                _tokenInfo.RefreshToken = result.Data.RefreshToken;
                _tokenInfo.ExpiresAt = DateTime.UtcNow.AddSeconds(result.Data.ExpiresIn);
                UpdateAuthHeader();
            }

            return result ?? new ApiResponse<LoginResponse> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<LoginResponse>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<PaginatedResponse<Device>>> GetDevicesAsync(int page = 1, int pageSize = 50)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.GetAsync($"/api/devices?page={page}&pageSize={pageSize}");
            return await response.Content.ReadFromJsonAsync<ApiResponse<PaginatedResponse<Device>>>()
                ?? new ApiResponse<PaginatedResponse<Device>> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<PaginatedResponse<Device>>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<Device>> GetDeviceAsync(string deviceId)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.GetAsync($"/api/devices/{deviceId}");
            return await response.Content.ReadFromJsonAsync<ApiResponse<Device>>()
                ?? new ApiResponse<Device> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<Device>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<object>> SendHeartbeatAsync(DeviceHeartbeatRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/devices/heartbeat", request);
            return await response.Content.ReadFromJsonAsync<ApiResponse<object>>()
                ?? new ApiResponse<object> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<DevicePolicy>> GetDevicePolicyAsync()
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.GetAsync("/api/devices/policy");
            return await response.Content.ReadFromJsonAsync<ApiResponse<DevicePolicy>>()
                ?? new ApiResponse<DevicePolicy> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<DevicePolicy>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<PaginatedResponse<CloudFile>>> GetFilesAsync(FileListRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var qs = $"?page={request.Page}&pageSize={request.PageSize}";
            if (!string.IsNullOrEmpty(request.DeviceId))
                qs += $"&device_id={Uri.EscapeDataString(request.DeviceId)}";
            if (!string.IsNullOrEmpty(request.Path))
                qs += $"&path={Uri.EscapeDataString(request.Path)}";

            var response = await _httpClient.GetAsync($"/api/files{qs}");
            var raw = await response.Content.ReadAsStringAsync();

            // Backend returns: { success, data: [...], meta: { pagination: { total, page, limit } } }
            var opts = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var wrapper = System.Text.Json.JsonSerializer.Deserialize<FilesApiResponse>(raw, opts);

            if (wrapper == null || !wrapper.Success)
                return new ApiResponse<PaginatedResponse<CloudFile>> { Success = false, Error = "Parse error" };

            var paginated = new PaginatedResponse<CloudFile>
            {
                Data     = wrapper.Data ?? new(),
                Total    = wrapper.Meta?.Pagination?.Total ?? wrapper.Data?.Count ?? 0,
                Page     = request.Page,
                PageSize = request.PageSize,
            };
            return new ApiResponse<PaginatedResponse<CloudFile>> { Success = true, Data = paginated };
        }
        catch (Exception ex)
        {
            return new ApiResponse<PaginatedResponse<CloudFile>> { Success = false, Error = ex.Message };
        }
    }

    // Internal DTO matching actual backend response shape
    private class FilesApiResponse
    {
        [System.Text.Json.Serialization.JsonPropertyName("success")]
        public bool Success { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("data")]
        public List<CloudFile>? Data { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("meta")]
        public ApiMeta? Meta { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("error")]
        public object? Error { get; set; }
    }

    public async Task<ApiResponse<object>> DeleteLocalFileAsync(string fileName, string filePath)
    {
        try
        {
            await EnsureValidTokenAsync();
            var body = new { file_name = fileName, file_path = filePath };
            var response = await _httpClient.PostAsJsonAsync("/api/files/delete-local", body);
            var raw = await response.Content.ReadAsStringAsync();
            var opts = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var result = System.Text.Json.JsonSerializer.Deserialize<ApiResponse<object>>(raw, opts);
            return result ?? new ApiResponse<object> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<object> { Success = false, Error = ex.Message };
        }
    }

    public async Task<ApiResponse<CloudFile>> CompleteUploadAsync(FileUploadCompleteRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/files/upload-complete", request);
            
            // Check HTTP status code
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                return new ApiResponse<CloudFile>
                {
                    Success = false,
                    Error = $"HTTP {(int)response.StatusCode}: {errorBody}"
                };
            }
            
            var result = await response.Content.ReadFromJsonAsync<ApiResponse<CloudFile>>();
            return result ?? new ApiResponse<CloudFile> { Success = false, Error = "Empty response from server" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<CloudFile>
            {
                Success = false,
                Error = $"{ex.GetType().Name}: {ex.Message}"
            };
        }
    }

    public async Task<ApiResponse<object>> DehydrateFileAsync(FileDehydrateRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/files/dehydrate", request);
            return await response.Content.ReadFromJsonAsync<ApiResponse<object>>()
                ?? new ApiResponse<object> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<Permission>> RequestPermissionAsync(PermissionRequestRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/permissions/request", request);
            return await response.Content.ReadFromJsonAsync<ApiResponse<Permission>>()
                ?? new ApiResponse<Permission> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<Permission>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public async Task<ApiResponse<PermissionCheckResponse>> CheckPermissionAsync(PermissionCheckRequest request)
    {
        try
        {
            await EnsureValidTokenAsync();
            var response = await _httpClient.PostAsJsonAsync("/api/permissions/check", request);
            return await response.Content.ReadFromJsonAsync<ApiResponse<PermissionCheckResponse>>()
                ?? new ApiResponse<PermissionCheckResponse> { Success = false, Error = "Unknown error" };
        }
        catch (Exception ex)
        {
            return new ApiResponse<PermissionCheckResponse>
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    public void SetToken(TokenInfo tokenInfo)
    {
        _tokenInfo = tokenInfo;
        UpdateAuthHeader();
    }

    public TokenInfo? GetToken() => _tokenInfo;

    private void UpdateAuthHeader()
    {
        if (_tokenInfo?.AccessToken != null)
        {
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _tokenInfo.AccessToken);
        }
    }

    private async Task EnsureValidTokenAsync()
    {
        if (_tokenInfo == null)
        {
            // No token - auto register device
            await AutoReRegisterAsync();
            return;
        }
    }

    // Called when API returns 401 - get fresh token via hardware re-register
    public async Task AutoReRegisterAsync()
    {
        await _tokenLock.WaitAsync();
        try
        {
            var machineId = GetMachineIdStatic();
            var request = new DeviceRegisterRequest
            {
                MachineName = Environment.MachineName,
                MachineId   = machineId,
                OsVersion   = Environment.OSVersion.ToString(),
            };

            var result = await AutoRegisterDeviceAsync(request);
            if (!result.Success || result.Data == null)
                throw new InvalidOperationException($"Re-register failed: {result.Error}");

            // Save new token to disk
            var tokenInfo = GetToken();
            if (tokenInfo != null)
                SentjaShared.Storage.TokenStorage.SaveToken(tokenInfo);
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private static string GetMachineIdStatic()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            return key?.GetValue("MachineGuid")?.ToString() ?? Environment.MachineName;
        }
        catch { return Environment.MachineName; }
    }
}


