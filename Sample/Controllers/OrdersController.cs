using Microsoft.AspNetCore.Mvc;
using Sample.Models;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.AspNetCore.OData.Results;

namespace Sample.Controllers
{
    public class OrdersController : ODataController
    {
        private readonly AppDbContext _context;

        public OrdersController(AppDbContext context)
        {
            _context = context;
        }

        [EnableQuery]
        public IActionResult Get()
        {
          return Ok(_context.Orders);
        }

        [EnableQuery]
        public IActionResult Get(int key)
        {
          var order = _context.Orders.Where(o => o.orderNumber == key);
          if (!order.Any())
          {
            return NotFound();
          }

          return Ok(SingleResult.Create(order));
        }

    }
}
