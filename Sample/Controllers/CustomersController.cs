using Microsoft.AspNetCore.Mvc;
using Sample.Models;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.AspNetCore.OData.Results;

namespace Sample.Controllers
{
    public class CustomersController : ODataController
    {
        private readonly ApiContext _context;

        public CustomersController(ApiContext context)
        {
            _context = context;
        }

        [EnableQuery]        
        public IActionResult Get()
        {
            try
            {
                var customers = _context.Customers.ToList();
                return Ok(customers);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error retrieving customers: {ex.Message}");
                return StatusCode(500, "Internal server error");
            }
        }

        [EnableQuery]
        public IActionResult Get(int key)
        {
            try
            {
                var customer = _context.Customers.Where(c => c.customerNumber == key);
                if (!customer.Any())
                {
                    return NotFound();
                }
                return Ok(SingleResult.Create(customer));
            }
            catch (Exception ex)
            {                
                Console.WriteLine($"Error retrieving customer with key {key}: {ex.Message}");
                return StatusCode(500, "Internal server error");
            }
        }
    }
}
