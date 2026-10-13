using Microsoft.AspNetCore.Mvc;

namespace Billing.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InvoicesController : ControllerBase
{
    private readonly ILogger<InvoicesController> _logger;

    public InvoicesController(ILogger<InvoicesController> logger)
    {
        _logger = logger;
    }

    [HttpGet("{id}")]
    public IActionResult Get(string id) => Ok(new { id });

    [HttpPost("{id}/pay")]
    public IActionResult Pay(string id)
    {
        if (id.StartsWith("paid-"))
        {
            _logger.LogError("Invoice {InvoiceId} was already paid", id);
            throw new InvalidOperationException("Invoice already paid");
        }
        return NoContent();
    }
}
