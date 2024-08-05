using Microsoft.AspNetCore.OData;
using Microsoft.EntityFrameworkCore;
using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Sample.Models;
using Sample.Repositories;
using Microsoft.OpenApi.Models;
using DotNetEnv;
using Sample.SecretsManager;
using System.Text.Json;

static IEdmModel GetEdmModel()
{
    ODataConventionModelBuilder builder = new();
    builder.EntitySet<Customer>("Customers");
    builder.EntitySet<Order>("Orders");
    return builder.GetEdmModel();
}

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    Env.Load();
    var connectionString = Env.GetString("DB_CONNECTION_STRING");
    builder.Configuration["ConnectionStrings:DefaultConnection"] = connectionString;
}
else
{
    var region = Amazon.RegionEndpoint.USEast1;
    var dbSecretsManager = new DbSecretsManager();
    var secretString = await dbSecretsManager.GetSecretAsync("Sample/Production/DB/Connection", region);
    var connectionDetails = JsonSerializer.Deserialize<ConnectionDetails>(secretString);   
    if (connectionDetails != null) {
        string connectionString = $"Server={connectionDetails.Server};Database={connectionDetails.Database};User={connectionDetails.User};Password={connectionDetails.Password};";
        builder.Configuration["ConnectionStrings:DefaultConnection"] = connectionString;
    }
    else
    {
        Console.WriteLine("Failed to retrieve connection details from Secrets Manager.");
    } 

}

builder.Services.AddControllers()
    .AddOData(options => options
        .AddRouteComponents("odata", GetEdmModel())
        .Select()
        .Filter()
        .OrderBy()
        .SetMaxTop(20)
        .Count()
        .Expand()
    );

builder.Services.AddDbContext<ApiContext>(opt =>
    opt.UseMySql(builder.Configuration.GetConnectionString("DefaultConnection"),
        new MySqlServerVersion(new Version(8, 0, 33))));

builder.Services.AddScoped<ApiContext>();

builder.Services.AddScoped<ICustomerRepo, CustomerRepo>();
builder.Services.AddScoped<IOrderRepo, OrderRepo>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Sample API", Version = "v1" });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApiContext>();
    try
    {
        dbContext.Database.CanConnect();
        Console.WriteLine("Database connection successful.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database connection failed: {ex.Message}");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Sample API V1");
        c.RoutePrefix = string.Empty;
    });
}

app.MapControllers();

app.Run();

public partial class Program { }