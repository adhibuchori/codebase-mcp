package payment

import (
	"errors"
	"fmt"
)

// ErrAlreadyRefunded is returned when a payment was refunded before.
var ErrAlreadyRefunded = errors.New("payment already refunded")

type Service struct {
	refunded map[string]bool
}

func NewService() *Service {
	return &Service{refunded: map[string]bool{}}
}

func (s *Service) Refund(id string) error {
	if s.refunded[id] {
		return fmt.Errorf("refund payment %s: %w", id, ErrAlreadyRefunded)
	}
	s.refunded[id] = true
	return nil
}
