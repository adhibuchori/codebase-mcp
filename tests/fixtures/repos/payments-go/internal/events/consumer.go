package events

import (
	"context"
	"log"

	"github.com/segmentio/kafka-go"
)

func ConsumeCancelledOrders() {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{"kafka:9092"},
		GroupID: "payments",
		Topic:   "orders.cancelled",
	})
	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			log.Printf("consumer stopped: %v", err)
			return
		}
		log.Printf("order %s cancelled", string(msg.Value))
	}
}
