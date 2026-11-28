package httpd

import (
	"net/http"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/telemetrymeta"
)

// requestSurfaceMiddleware tags each request with the client it came from, so
// product telemetry emitted further down (a sent message, a spawn, a merge) can
// say desktop, mobile or CLI. It is classification only and never rejects.
func requestSurfaceMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := exactAllowedOrigins(allowedOrigins)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			surface := requestSurface(r, allowed)
			next.ServeHTTP(w, r.WithContext(telemetrymeta.WithSurface(r.Context(), surface)))
		})
	}
}

// requestSurface classifies desktop renderer traffic and native CLI callers. The
// mobile surface value remains in telemetry schemas for historical data.
func requestSurface(r *http.Request, allowedOrigins map[string]struct{}) domain.RequestSurface {
	if _, ok := allowedOrigins[r.Header.Get("Origin")]; ok {
		return domain.RequestSurfaceDesktop
	}
	return domain.RequestSurfaceCLI
}
