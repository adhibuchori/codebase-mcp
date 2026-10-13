package com.acme.orders.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@FeignClient(name = "payments", path = "/api/payments")
public interface PaymentClient {
    @PostMapping("/{id}/refund")
    void refund(@PathVariable("id") String paymentId);
}
