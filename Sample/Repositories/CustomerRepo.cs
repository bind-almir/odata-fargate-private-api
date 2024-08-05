using Sample.Models;
namespace Sample.Repositories
{
  public class CustomerRepo : ICustomerRepo
  {
    private readonly ApiContext _context;

    public CustomerRepo(ApiContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public IEnumerable<Customer> GetAllCustomers()
    {
        return _context.Customers.ToList();
    }
    public IEnumerable<Customer> GetCustomers()
    {
      Console.WriteLine("GetCustomers");
      return _context.Customers.ToList();
    }

    public Customer GetCustomer(int customerNumber)
    {
      return _context.Customers.FirstOrDefault(c => c.customerNumber == customerNumber)
              ?? throw new KeyNotFoundException($"Customer with cusomerNumber {customerNumber} not found.");
    }
  }
}