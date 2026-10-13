package payment

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler serves the payment endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"id": c.Param("id")})
}

func (h *Handler) Refund(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.Refund(id); err != nil {
		log.Printf("refund failed for payment %s: %v", id, err)
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
