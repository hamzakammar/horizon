package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type contextKey string

const UserIDKey contextKey = "user_id"

// publicRoutes are paths that do NOT require JWT authentication.
var publicRoutes = map[string]bool{
	"/health":       true,
	"/metrics":      true,
	"/onboard":      true,
	"/auth/signup":  true,
	"/auth/signin":  true,
	"/auth/refresh": true,
}

func isPublicRoute(path string) bool {
	if publicRoutes[path] {
		return true
	}
	if strings.HasPrefix(path, "/vnc/") || path == "/websockify" {
		return true
	}
	if strings.HasPrefix(path, "/auth/d2l/status/") {
		return true
	}
	return false
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

// verifyTokenWithSupabase calls Supabase's /auth/v1/user endpoint to validate
// the token server-side. This is immune to key rotation, alg changes, and
// kid mismatches — Supabase does the verification using its own secret.
func verifyTokenWithSupabase(tokenStr string) (string, error) {
	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if supabaseURL == "" {
		return "", fmt.Errorf("SUPABASE_URL not set")
	}
	if anonKey == "" {
		// Fall back to JWT secret — not ideal but better than nothing
		anonKey = os.Getenv("SUPABASE_JWT_SECRET")
	}

	req, err := http.NewRequest("GET", supabaseURL+"/auth/v1/user", nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	req.Header.Set("apikey", anonKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("supabase request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("supabase rejected token (status %d): %s", resp.StatusCode, string(body))
	}

	var user struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", fmt.Errorf("failed to parse user response: %w", err)
	}
	if user.ID == "" {
		return "", fmt.Errorf("supabase returned empty user id")
	}
	return user.ID, nil
}

// Auth validates JWTs by delegating to Supabase's own /auth/v1/user endpoint.
// This approach is immune to signing key rotation, alg mismatches, and kid issues.
func Auth(_ string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isPublicRoute(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"missing or invalid Authorization header"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			userID, err := verifyTokenWithSupabase(tokenStr)
			if err != nil {
				fmt.Printf("[AUTH] Token validation failed: %v\n", err)
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
