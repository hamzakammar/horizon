package handlers

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

// NewProxy creates a reverse-proxy handler that forwards all requests to the
// Node worker defined by NODE_WORKER_URL (default: http://localhost:3000).
func NewProxy() http.HandlerFunc {
	workerURL := os.Getenv("NODE_WORKER_URL")
	if workerURL == "" {
		workerURL = "http://localhost:3000"
	}

	target, err := url.Parse(workerURL)
	if err != nil {
		panic(fmt.Sprintf("invalid NODE_WORKER_URL %q: %v", workerURL, err))
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Customise error handling so proxy failures return proper JSON.
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		fmt.Printf("[PROXY] upstream error: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"upstream unavailable"}`))
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Forward the original host so the Node app can build correct URLs.
		r.Header.Set("X-Forwarded-Host", r.Host)
		r.Header.Set("X-Forwarded-Proto", "https")
		proxy.ServeHTTP(w, r)
	}
}
