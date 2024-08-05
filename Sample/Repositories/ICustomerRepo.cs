using Sample.Models;
namespace Sample.Repositories
{
  public interface ICustomerRepo
  {
    IEnumerable<Customer> GetCustomers();
    Customer GetCustomer(int customerNumber);
  }
}