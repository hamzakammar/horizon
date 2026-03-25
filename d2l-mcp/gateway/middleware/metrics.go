package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	gometrics "github.com/hamzakammar/horizon-gateway/metrics"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, status: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// Metrics returns middleware that instruments every request with Prometheus metrics.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := newResponseWriter(w)

		next.ServeHTTP(rw, r)

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(rw.status)
		route := r.URL.Path
		method := r.Method

		labels := []string{method, route, status}
		gometrics.RequestDuration.WithLabelValues(labels...).Observe(duration)
		gometrics.RequestsTotal.WithLabelValues(labels...).Inc()

		fmt.Printf("[%s] %s %s %d (%.3fs)\n", time.Now().Format(time.RFC3339), method, route, rw.status, duration)
	})
}
