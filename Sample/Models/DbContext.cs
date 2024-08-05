using Microsoft.EntityFrameworkCore;

namespace Sample.Models
{
  public class AppDbContext : DbContext
  {
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Customer> Customers { get; set; }
    public DbSet<Order> Orders { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
      modelBuilder.Entity<Customer>()
          .HasKey(c => c.customerNumber);

      modelBuilder.Entity<Order>()
          .HasKey(o => o.orderNumber);

      modelBuilder.Entity<Customer>()
          .HasMany(c => c.Orders)
          .WithOne()
          .HasForeignKey(o => o.customerNumber);
    }
  }
}
