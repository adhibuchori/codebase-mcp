package com.acme.orders.service;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class OrderServiceTest {
    @Test
    void cancellingTwiceFails() {
        OrderService service = TestOrders.serviceWithCancelledOrder("o-1");
        assertThrows(IllegalStateException.class, () -> service.cancel("o-1"));
    }
}
