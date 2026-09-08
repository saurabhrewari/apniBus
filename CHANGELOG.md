# ApniBus Change Log

## 2026-09-08

- Hardened Socket.IO write events so live location, manual check-in, seat updates, and trip stop actions require an authenticated driver or authority when `REQUIRE_AUTH=true`.
- Sent the driver JWT in the Socket.IO handshake and kept passenger route subscriptions public.
- Added a 100 KB JSON request-body limit to reduce oversized request abuse.
- Made malformed JWTs fail safely without throwing timing-safe comparison or decoding errors.
- Added token verification tests and kept all tracking and coordinate tests passing.
- Added the bus favicon to remove the browser console 404 on `/favicon.ico`.
- Removed expected login-failure console errors from the driver and authority screens while preserving the visible error message.
- Applied npm security fixes; backend and frontend production dependency audits now report zero vulnerabilities.
- Protected legacy journey mutations and the bulk bus deletion endpoint with role-based authentication.
- Restricted public registration to passenger accounts after the one-time first-authority bootstrap.

## Verification

- Backend tests: 7 passed.
- Frontend production build: passed.
- Local browser smoke test: gateway and passenger navigation passed; incorrect driver credentials stayed on the login screen and displayed `Invalid Credentials`.
- Local MongoDB connection: passed.
- Render health endpoint: timed out during this check and needs a retry from a network where the Render service is reachable.
