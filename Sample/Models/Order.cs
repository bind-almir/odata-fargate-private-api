using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Sample.Models
{
  [Table("orders")]
  public class Order
  {
    [Key]
    public int orderNumber { get; set; }
    public DateTime orderDate { get; set; }
    public DateTime requiredDate { get; set; }
    public DateTime shippedDate { get; set; }
    public string? status { get; set; }
    public string? comments { get; set; }
    public int customerNumber { get; set; }
  }
}