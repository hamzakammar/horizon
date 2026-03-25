package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	// RequestDuration tracks HTTP request latency.
	RequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Histogram of HTTP request durations in seconds.",
			Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
		},
		[]string{"method", "route", "status"},
	)

	// RequestsTotal counts total HTTP requests.
	RequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests.",
		},
		[]string{"method", "route", "status"},
	)

	// ActiveBrowserSessions tracks the number of currently active browser (VNC) sessions.
	ActiveBrowserSessions = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "active_browser_sessions",
			Help: "Number of currently active browser/VNC sessions.",
		},
	)

	// D2LAuthDuration tracks time spent in D2L auth phases.
	D2LAuthDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "d2l_auth_duration_seconds",
			Help:    "Duration of D2L authentication phases in seconds.",
			Buckets: []float64{.1, .5, 1, 2, 5, 10, 30, 60, 120},
		},
		[]string{"phase"}, // "xvfb", "browser", "login", "duo", "total"
	)

	// VectorSearchDuration tracks RAG/semantic search latency.
	VectorSearchDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "vector_search_duration_seconds",
			Help:    "Duration of vector (semantic) search operations in seconds.",
			Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
		},
	)

	// MCPToolDuration tracks per-tool execution latency.
	MCPToolDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "mcp_tool_duration_seconds",
			Help:    "Duration of MCP tool invocations in seconds.",
			Buckets: []float64{.01, .05, .1, .25, .5, 1, 2.5, 5, 10, 30},
		},
		[]string{"tool"},
	)
)

// Register all metrics with the default Prometheus registry.
func Register() {
	prometheus.MustRegister(
		RequestDuration,
		RequestsTotal,
		ActiveBrowserSessions,
		D2LAuthDuration,
		VectorSearchDuration,
		MCPToolDuration,
	)
}
