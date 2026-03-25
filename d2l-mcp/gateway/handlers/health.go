package handlers

import (
	"encoding/json"
	"net/http"
	"time"
)

// HealthResponse is the JSON body returned by the health endpoint.
type HealthResponse struct {
	OK        bool   `json:"ok"`
	Timestamp string `json:"timestamp"`
	Service   string `json:"service"`
}

// Health handles GET /health — returns 200 with a simple status body.
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(HealthResponse{
		OK:        true,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Service:   "horizon-gateway",
	})
}
