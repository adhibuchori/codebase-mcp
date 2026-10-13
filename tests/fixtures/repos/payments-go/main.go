package main

import (
	"log"

	"github.com/acme/payments/internal/events"
	"github.com/acme/payments/internal/payment"
	"github.com/gin-gonic/gin"
)

func main() {
	handler := payment.NewHandler(payment.NewService())
	r := gin.Default()
	api := r.Group("/api")
	api.GET("/payments/:id", handler.Get)
	api.POST("/payments/:id/refund", handler.Refund)
	go events.ConsumeCancelledOrders()
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
