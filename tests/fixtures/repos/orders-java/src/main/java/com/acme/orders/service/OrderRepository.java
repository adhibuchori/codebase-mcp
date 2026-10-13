package com.acme.orders.service;

import java.util.Optional;

public interface OrderRepository {
    Optional<Order> findById(String id);

    Order save(Order order);
}
