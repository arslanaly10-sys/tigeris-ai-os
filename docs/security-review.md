# Security review — 2 November 2026

Scope: the paths added in Phase 5 (sign-in, uploads and evidence store, Claude, alerts, new screens and their read
scope) plus deployment defaults. Method: code reading of each path, then a test for every fix. Decision: D-125.

| #   | Finding                                                                                                                                                                          | Severity | Status                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The API would start in production with the built-in default `SESSION_SECRET`. Sessions are signed with it, so anyone who knows the default could forge a session for any person. | High     | Fixed: the API refuses to start in production with the default secret.                                                                   |
| 2   | Demo sign-in stayed on in production, letting anyone who reaches TIGERIS sign in as a demo principal.                                                                            | Medium   | Fixed: off in production unless `DEMO_SIGN_IN=true`; every demo route answers 404 when off.                                              |
| 3   | With Claude on, excerpts from restricted or confidential cases could be sent to an external model.                                                                               | Medium   | Fixed: `MODEL_MAX_CLASSIFICATION` (default `internal`) is a hard ceiling; above it the deterministic answer is used and nothing is sent. |
| 4   | `OIDC_ISSUER` accepted plain http, so discovery and signing keys could be fetched over an unprotected connection.                                                                | Low      | Fixed: https only.                                                                                                                       |
| 5   | No Content-Security-Policy on the web app.                                                                                                                                       | Low      | Fixed: same-origin policy in `deploy/nginx.conf` and the production preview; 11 main screens checked in a browser with no violations.    |

Checked and found sound: upload file types are detected from content against a fixed list (no user-controlled paths);
evidence keys are content hashes; the OIDC callback checks state, nonce, issuer, audience, expiry and an RS256 signature
by key id and redirects only to fixed paths; new routes filter by classification and case scope; alerts carry no
restricted or confidential detail; errors never return stack traces; cookies are httpOnly and SameSite=Lax (blocking
cross-site POSTs); the API role cannot bypass row-level security.

Not covered here: rate limiting of sign-in and Ask TIGERIS (Claude spend is capped by the budget), dependency
vulnerability scanning, penetration testing, and a review of the deployment environment itself. These belong to the
pilot's own security assessment.
