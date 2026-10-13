package com.acme.orders.events;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class OrderEvents {
    private final KafkaTemplate<String, String> kafkaTemplate;

    public OrderEvents(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void cancelled(String orderId) {
        kafkaTemplate.send("orders.cancelled", orderId);
    }
}
