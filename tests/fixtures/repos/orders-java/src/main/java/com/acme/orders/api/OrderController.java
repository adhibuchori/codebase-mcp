package com.acme.orders.api;

import com.acme.orders.service.Order;
import com.acme.orders.service.OrderService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService service;

    public OrderController(OrderService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public Order get(@PathVariable String id) {
        return service.find(id);
    }

    @PostMapping("/{id}/cancel")
    public Order cancel(@PathVariable String id) {
        return service.cancel(id);
    }
}
