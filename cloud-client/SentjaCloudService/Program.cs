using SentjaCloudService;
using SentjaCloudService.Services;
using SentjaShared.ApiClient;

var builder = Host.CreateApplicationBuilder(args);

// Configure Windows Service
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "SentjaCloudService";
});

// Register services
builder.Services.AddSingleton<SentjaApiClient>();
builder.Services.AddSingleton<HeartbeatService>();
builder.Services.AddSingleton<PolicyService>();
builder.Services.AddSingleton<SyncManager>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
