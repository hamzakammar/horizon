package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserIDKey contextKey = "user_id"

// jwksKey represents a single JSON Web Key.
type jwksKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwksResponse struct {
	Keys []jwksKey `json:"keys"`
}

// jwksCache holds the cached JWKS data.
type jwksCache struct {
	mu          sync.RWMutex
	keys        map[string]*jwksKey
	lastFetched time.Time
	jwksURL     string
}

var cache *jwksCache
var cacheOnce sync.Once

func initCache(jwksURL string) *jwksCache {
	cacheOnce.Do(func() {
		cache = &jwksCache{
			keys:    make(map[string]*jwksKey),
			jwksURL: jwksURL,
		}
	})
	return cache
}

// fetchJWKS fetches and caches the JWKS from Supabase.
func (c *jwksCache) refresh() error {
	resp, err := http.Get(c.jwksURL)
	if err != nil {
		return fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("failed to decode JWKS: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.keys = make(map[string]*jwksKey)
	for i := range jwks.Keys {
		k := jwks.Keys[i]
		c.keys[k.Kid] = &k
	}
	c.lastFetched = time.Now()
	fmt.Printf("[AUTH] JWKS refreshed: %d key(s)\n", len(c.keys))
	return nil
}

// getKey retrieves a key by kid, refreshing if stale (>5 min).
func (c *jwksCache) getKey(kid string) (*jwksKey, error) {
	c.mu.RLock()
	stale := time.Since(c.lastFetched) > 5*time.Minute
	key, ok := c.keys[kid]
	c.mu.RUnlock()

	if stale || !ok {
		if err := c.refresh(); err != nil {
			return nil, err
		}
		c.mu.RLock()
		key, ok = c.keys[kid]
		c.mu.RUnlock()
		if !ok {
			return nil, fmt.Errorf("key %q not found in JWKS", kid)
		}
	}
	return key, nil
}

// publicRoutes are paths that do NOT require JWT authentication.
var publicRoutes = map[string]bool{
	"/health":      true,
	"/metrics":     true,
	"/onboard":     true,
	"/auth/signup": true,
	"/auth/signin": true,
}

func isPublicRoute(path string) bool {
	if publicRoutes[path] {
		return true
	}
	// Also allow VNC static assets (noVNC html/js served without auth)
	if strings.HasPrefix(path, "/vnc/") {
		return true
	}
	return false
}

// verifyHS256 verifies a Supabase HS256 JWT using the JWT secret env var.
func verifyHS256(tokenStr string) (string, error) {
	secret := os.Getenv("SUPABASE_JWT_SECRET")
	if secret == "" {
		return "", fmt.Errorf("SUPABASE_JWT_SECRET not set")
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid HS256 token: %w", err)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", fmt.Errorf("missing sub claim")
	}
	return sub, nil
}

// Auth returns JWT validation middleware using Supabase JWKS (RS256) with
// HS256 fallback for tokens issued without a kid header.
func Auth(jwksURL string) func(http.Handler) http.Handler {
	c := initCache(jwksURL)
	// Pre-fetch JWKS on startup (non-fatal if it fails)
	if err := c.refresh(); err != nil {
		fmt.Printf("[AUTH] Initial JWKS fetch failed (will retry): %v\n", err)
	}

	// Background refresh every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if err := c.refresh(); err != nil {
				fmt.Printf("[AUTH] JWKS refresh error: %v\n", err)
			}
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for public routes
			if isPublicRoute(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Extract Bearer token
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"missing or invalid Authorization header"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			// Parse without verification first to get the kid header
			unverified, _, err := jwt.NewParser().ParseUnverified(tokenStr, jwt.MapClaims{})
			if err != nil {
				http.Error(w, `{"error":"invalid token format"}`, http.StatusUnauthorized)
				return
			}

			kid, hasKid := unverified.Header["kid"].(string)

			var sub string

			if !hasKid || kid == "" {
				// No kid — Supabase HS256 token. Verify with JWT secret.
				sub, err = verifyHS256(tokenStr)
				if err != nil {
					fmt.Printf("[AUTH] HS256 verification failed: %v\n", err)
					http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
					return
				}
			} else {
				// Has kid — RS256 token. Verify with JWKS.
				jwk, err := c.getKey(kid)
				if err != nil {
					http.Error(w, `{"error":"could not retrieve signing key"}`, http.StatusUnauthorized)
					return
				}

				pubKey, err := jwkToRSAPublicKey(jwk)
				if err != nil {
					http.Error(w, `{"error":"invalid signing key"}`, http.StatusUnauthorized)
					return
				}

				token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
					if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
						return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
					}
					return pubKey, nil
				})
				if err != nil || !token.Valid {
					http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
					return
				}

				claims, ok := token.Claims.(jwt.MapClaims)
				if !ok {
					http.Error(w, `{"error":"invalid claims"}`, http.StatusUnauthorized)
					return
				}
				sub, _ = claims["sub"].(string)
				if sub == "" {
					http.Error(w, `{"error":"token missing sub claim"}`, http.StatusUnauthorized)
					return
				}
			}

			// Inject user_id into context and forward
			ctx := context.WithValue(r.Context(), UserIDKey, sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type contextKey string

const UserIDKey contextKey = "user_id"

// jwksKey represents a single JSON Web Key.
type jwksKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwksResponse struct {
	Keys []jwksKey `json:"keys"`
}

// jwksCache holds the cached JWKS data.
type jwksCache struct {
	mu          sync.RWMutex
	keys        map[string]*jwksKey
	lastFetched time.Time
	jwksURL     string
}

var cache *jwksCache
var cacheOnce sync.Once

func initCache(jwksURL string) *jwksCache {
	cacheOnce.Do(func() {
		cache = &jwksCache{
			keys:    make(map[string]*jwksKey),
			jwksURL: jwksURL,
		}
	})
	return cache
}

// fetchJWKS fetches and caches the JWKS from Supabase.
func (c *jwksCache) refresh() error {
	resp, err := http.Get(c.jwksURL)
	if err != nil {
		return fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("failed to decode JWKS: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.keys = make(map[string]*jwksKey)
	for i := range jwks.Keys {
		k := jwks.Keys[i]
		c.keys[k.Kid] = &k
	}
	c.lastFetched = time.Now()
	fmt.Printf("[AUTH] JWKS refreshed: %d key(s)\n", len(c.keys))
	return nil
}

// getKey retrieves a key by kid, refreshing if stale (>5 min).
func (c *jwksCache) getKey(kid string) (*jwksKey, error) {
	c.mu.RLock()
	stale := time.Since(c.lastFetched) > 5*time.Minute
	key, ok := c.keys[kid]
	c.mu.RUnlock()

	if stale || !ok {
		if err := c.refresh(); err != nil {
			return nil, err
		}
		c.mu.RLock()
		key, ok = c.keys[kid]
		c.mu.RUnlock()
		if !ok {
			return nil, fmt.Errorf("key %q not found in JWKS", kid)
		}
	}
	return key, nil
}

// publicRoutes are paths that do NOT require JWT authentication.
var publicRoutes = map[string]bool{
	"/health":       true,
	"/metrics":      true,
	"/onboard":      true,
	"/auth/signup":  true,
	"/auth/signin":  true,
}

func isPublicRoute(path string) bool {
	return publicRoutes[path]
}

// Auth returns JWT validation middleware using Supabase JWKS.
func Auth(jwksURL string) func(http.Handler) http.Handler {
	c := initCache(jwksURL)
	// Pre-fetch JWKS on startup (non-fatal if it fails)
	if err := c.refresh(); err != nil {
		fmt.Printf("[AUTH] Initial JWKS fetch failed (will retry): %v\n", err)
	}

	// Background refresh every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if err := c.refresh(); err != nil {
				fmt.Printf("[AUTH] JWKS refresh error: %v\n", err)
			}
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for public routes
			if isPublicRoute(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Extract Bearer token
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"missing or invalid Authorization header"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			// Parse without verification first to get the kid header
			unverified, _, err := jwt.NewParser().ParseUnverified(tokenStr, jwt.MapClaims{})
			if err != nil {
				http.Error(w, `{"error":"invalid token format"}`, http.StatusUnauthorized)
				return
			}

			kid, ok := unverified.Header["kid"].(string)
			if !ok || kid == "" {
				// Supabase legacy tokens may not have kid; fall through with symmetric verify
				// For now, reject tokens without kid (RS256 only)
				http.Error(w, `{"error":"token missing kid header"}`, http.StatusUnauthorized)
				return
			}

			jwk, err := c.getKey(kid)
			if err != nil {
				http.Error(w, `{"error":"could not retrieve signing key"}`, http.StatusUnauthorized)
				return
			}

			// Build RSA public key from JWK
			pubKey, err := jwkToRSAPublicKey(jwk)
			if err != nil {
				http.Error(w, `{"error":"invalid signing key"}`, http.StatusUnauthorized)
				return
			}

			// Verify and parse the token
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return pubKey, nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			// Extract sub (user_id) from claims
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":"invalid claims"}`, http.StatusUnauthorized)
				return
			}
			sub, _ := claims["sub"].(string)
			if sub == "" {
				http.Error(w, `{"error":"token missing sub claim"}`, http.StatusUnauthorized)
				return
			}

			// Inject user_id into context and forward
			ctx := context.WithValue(r.Context(), UserIDKey, sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
