using Sample.Models;

namespace Sample.Repositories;

public class OrderRepo : IOrderRepo
{
  private readonly ApiContext _context;

  public OrderRepo(ApiContext context)
  {
        _context = context ?? throw new ArgumentNullException(nameof(context));

  }

  public IEnumerable<Order> GetOrders()
  {
    return _context.Orders.ToList();
  }

  public Order GetOrder(int orderNumber)
  {
    return _context.Orders.FirstOrDefault(o => o.orderNumber == orderNumber)
            ?? throw new KeyNotFoundException($"Order with orderNumber {orderNumber} not found.");
  }
}