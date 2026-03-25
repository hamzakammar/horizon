package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/hamzakammar/horizon-gateway/handlers"
	"github.com/hamzakammar/horizon-gateway/metrics"
	"github.com/hamzakammar/horizon-gateway/middleware"
)

func main() {
	// Register all Prometheus metrics.
	metrics.Register()

	// Configuration from environment.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	jwksURL := os.Getenv("SUPABASE_JWKS_URL")
	if jwksURL == "" {
		jwksURL = "https://qialmumlcezeqvyyhjlu.supabase.co/auth/v1/.well-known/jwks.json"
	}

	// Rate limiter: 300 requests per minute per user/IP.
	limiter := middleware.NewRateLimiter(300, time.Minute)

	r := chi.NewRouter()

	// ── Global middleware ────────────────────────────────────────────────────
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Metrics)           // Prometheus instrumentation (all routes)
	r.Use(middleware.Auth(jwksURL))     // JWT verification (skips public routes internally)
	r.Use(middleware.RateLimit(limiter)) // Per-user rate limiting

	// ── Public routes (no auth required) ────────────────────────────────────
	r.Get("/health", handlers.Health)

	r.Handle("/metrics", promhttp.Handler())

	// ── Proxy all other routes to Node worker ────────────────────────────────
	proxy := handlers.NewProxy()
	r.HandleFunc("/*", proxy)

	addr := ":" + port
	fmt.Printf("[GATEWAY] Horizon MCP Gateway starting on %s\n", addr)
	fmt.Printf("[GATEWAY] Proxying to NODE_WORKER_URL: %s\n", nodeWorkerURL())
	fmt.Printf("[GATEWAY] JWKS URL: %s\n", jwksURL)

	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil {
		fmt.Fprintf(os.Stderr, "[GATEWAY] Fatal: %v\n", err)
		os.Exit(1)
	}
}

func nodeWorkerURL() string {
	if u := os.Getenv("NODE_WORKER_URL"); u != "" {
		return u
	}
	return "http://localhost:3000"
}
