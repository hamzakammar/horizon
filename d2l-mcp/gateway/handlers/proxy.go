package handlers

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
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

// ProxyWebSocket tunnels a WebSocket upgrade request directly to the Node worker.
// chi's router doesn't handle WS upgrades, so we intercept before the router.
func ProxyWebSocket(nodeWorkerURL string, w http.ResponseWriter, r *http.Request) {
	target, err := url.Parse(nodeWorkerURL)
	if err != nil {
		http.Error(w, "bad gateway", http.StatusBadGateway)
		return
	}

	// Dial the Node worker TCP connection
	host := target.Host
	if !strings.Contains(host, ":") {
		host += ":80"
	}
	backendConn, err := net.Dial("tcp", host)
	if err != nil {
		fmt.Printf("[WS PROXY] failed to connect to backend: %v\n", err)
		http.Error(w, "bad gateway", http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	// Hijack the client connection
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "websocket not supported", http.StatusInternalServerError)
		return
	}
	clientConn, _, err := hijacker.Hijack()
	if err != nil {
		fmt.Printf("[WS PROXY] hijack failed: %v\n", err)
		return
	}
	defer clientConn.Close()

	// Forward the original HTTP upgrade request to backend
	r.Host = target.Host
	r.Header.Set("X-Forwarded-Proto", "https")
	if err := r.Write(backendConn); err != nil {
		fmt.Printf("[WS PROXY] failed to write request: %v\n", err)
		return
	}

	// Bidirectional pipe
	done := make(chan struct{}, 2)
	go func() { io.Copy(backendConn, clientConn); done <- struct{}{} }()
	go func() { io.Copy(clientConn, backendConn); done <- struct{}{} }()
	<-done

	fmt.Printf("[WS PROXY] websocket session ended: %s\n", r.URL.Path)
}

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
