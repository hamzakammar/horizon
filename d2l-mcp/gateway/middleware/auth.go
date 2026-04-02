package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

// resolveAPIKey hashes the API key and looks it up in the api_keys table via Supabase REST API.
func resolveAPIKey(apiKey string) (string, error) {
	// SHA-256 hash the key
	hash := sha256.Sum256([]byte(apiKey))
	keyHash := hex.EncodeToString(hash[:])

	sbURL := getSupabaseURL()
	// Use service role key for api_keys lookup (bypasses RLS)
	sbKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if sbKey == "" {
		sbKey = getAnonKey()
	}
	if sbURL == "" || sbKey == "" {
		return "", fmt.Errorf("missing Supabase config for API key validation")
	}

	// Query api_keys table
	restURL := fmt.Sprintf("%s/rest/v1/api_keys?key_hash=eq.%s&select=user_id&limit=1", sbURL, keyHash)
	req, err := http.NewRequest("GET", restURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", sbKey)
	req.Header.Set("Authorization", "Bearer "+sbKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("api_keys lookup failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("api_keys lookup returned %d: %s", resp.StatusCode, string(body))
	}

	var rows []struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal(body, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("API key not found")
	}
	return rows[0].UserID, nil
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

			// Check for API key auth (x-api-key header or Bearer hzn_ prefix)
			apiKey := r.Header.Get("x-api-key")
			authHeader := r.Header.Get("Authorization")
			if apiKey == "" && authHeader != "" && strings.HasPrefix(authHeader, "Bearer hzn_") {
				apiKey = strings.TrimPrefix(authHeader, "Bearer ")
			}
			if apiKey != "" && strings.HasPrefix(apiKey, "hzn_") {
				// Resolve API key to userId via Supabase
				resolvedUserID, apiErr := resolveAPIKey(apiKey)
				if apiErr != nil {
					fmt.Printf("[AUTH] API key validation failed: %v\n", apiErr)
					http.Error(w, `{"error":"invalid API key"}`, http.StatusUnauthorized)
					return
				}
				fmt.Printf("[AUTH] API key auth OK, userId=%s\n", resolvedUserID)
				ctx := context.WithValue(r.Context(), UserIDKey, resolvedUserID)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

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
