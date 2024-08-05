using Sample.Models;

namespace Sample.Repositories
{
  public interface IOrderRepo
  {
    IEnumerable<Order> GetOrders();
    Order GetOrder(int orderNumber);
  }
}