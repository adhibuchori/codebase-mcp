package com.acme.orders.service;

public record Order(String id, String paymentId, boolean cancelled) {
    public boolean isCancelled() {
        return cancelled;
    }
}
