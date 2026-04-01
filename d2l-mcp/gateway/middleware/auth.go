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

type supabaseUser struct {
	ID string `json:"id"`
}

type supabaseSession struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresAt    int64        `json:"expires_at"`
	User         supabaseUser `json:"user"`
}

func getSupabaseURL() string  { return os.Getenv("SUPABASE_URL") }
func getAnonKey() string {
	k := os.Getenv("SUPABASE_ANON_KEY")
	if k == "" {
		k = os.Getenv("SUPABASE_JWT_SECRET")
	}
	return k
}

// verifyAccessToken calls Supabase /auth/v1/user to validate an access token.
func verifyAccessToken(tokenStr string) (string, error) {
	req, err := http.NewRequest("GET", getSupabaseURL()+"/auth/v1/user", nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	req.Header.Set("apikey", getAnonKey())

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("supabase request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("supabase rejected token (status %d): %s", resp.StatusCode, string(body))
	}

	var user supabaseUser
	if err := json.Unmarshal(body, &user); err != nil || user.ID == "" {
		return "", fmt.Errorf("failed to parse user from response")
	}
	return user.ID, nil
}

// exchangeRefreshToken exchanges a refresh token for a fresh session.
func exchangeRefreshToken(refreshToken string) (*supabaseSession, error) {
	body := fmt.Sprintf(`{"refresh_token":"%s"}`, refreshToken)
	req, err := http.NewRequest("POST",
		getSupabaseURL()+"/auth/v1/token?grant_type=refresh_token",
		strings.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", getAnonKey())

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("refresh request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("refresh failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var session supabaseSession
	if err := json.Unmarshal(respBody, &session); err != nil || session.User.ID == "" {
		return nil, fmt.Errorf("failed to parse session from refresh response")
	}
	return &session, nil
}

// isLikelyRefreshToken returns true if the token looks like a Supabase refresh token
// (short alphanumeric string, not a JWT which always contains dots).
func isLikelyRefreshToken(token string) bool {
	return !strings.Contains(token, ".")
}

// Auth validates tokens by delegating to Supabase.
// Accepts both access tokens (JWT) and refresh tokens.
// If a refresh token is provided, it's exchanged for a fresh access token automatically.
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

			var userID string
			var err error

			if isLikelyRefreshToken(tokenStr) {
				// Refresh token — exchange for fresh access token
				fmt.Printf("[AUTH] Refresh token detected, exchanging for access token\n")
				session, refreshErr := exchangeRefreshToken(tokenStr)
				if refreshErr != nil {
					fmt.Printf("[AUTH] Refresh token exchange failed: %v\n", refreshErr)
					http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
					return
				}
				userID = session.User.ID
				// Forward the fresh access token to the Node worker
				r.Header.Set("Authorization", "Bearer "+session.AccessToken)
				fmt.Printf("[AUTH] Refresh exchange OK, userId=%s\n", userID)
			} else {
				// Access token (JWT) — verify directly with Supabase
				userID, err = verifyAccessToken(tokenStr)
				if err != nil {
					fmt.Printf("[AUTH] Access token validation failed: %v\n", err)
					http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
					return
				}
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
