package com.acme.orders.service;

import com.acme.orders.client.PaymentClient;
import com.acme.orders.events.OrderEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private final PaymentClient payments;
    private final OrderEvents events;
    private final OrderRepository repository;

    public OrderService(PaymentClient payments, OrderEvents events, OrderRepository repository) {
        this.payments = payments;
        this.events = events;
        this.repository = repository;
    }

    public Order find(String id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Order not found: " + id));
    }

    public Order cancel(String id) {
        Order order = find(id);
        if (order.isCancelled()) {
            throw new IllegalStateException("Order already cancelled");
        }
        payments.refund(order.paymentId());
        log.warn("Order {} cancelled after payment {} was refunded", id, order.paymentId());
        events.cancelled(id);
        return repository.save(new Order(id, order.paymentId(), true));
    }
}
