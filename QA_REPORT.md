# ApniBus QA Report

Date: 2026-09-08

## Verified

- Backend automated tests: 7 passed.
- Frontend production build: passed with Vite.
- Backend and frontend dependency audits: 0 vulnerabilities after `npm audit fix`.
- Local backend health: HTTP 200, MongoDB connected.
- Deployed health: HTTP 200, MongoDB connected.
- Deployed gateway: loaded successfully with no browser console errors.
- Deployed passenger station search: `Rewari Stand` to `Gurgaon Bus Stand` returned 3 buses.
- Deployed live status: `HR47-1001` opened the vertical route stepper with four stops, schedule fields, seat summary, offline state, and map toggle.
- Deployed search API: `Rewari` returned matching route/bus data.
- Local wrong-driver-password flow: stayed on the login screen and displayed `Invalid Credentials`.
- Production unauthenticated journey write: returned HTTP 401 after the authorization deployment.
- Driver ownership guard: code-level review and build verification confirm unassigned buses cannot be managed by driver sessions.
- Local server lifecycle: health passed after restart and the listening port was released after shutdown.
- JWT tests: malformed signatures and unsupported algorithms are rejected; valid tokens continue to verify.
- Render manifest: explicit production `NODE_ENV` and deployed `CORS_ORIGINS` are configured.
- Deployed API matrix: public stops/routes/schedules/buses/search endpoints returned 200; analytics, operations, and `/api/users/me` correctly returned 401 without a session.
- Responsive smoke checks: local passenger dashboard rendered at 390x844 mobile, 768x1024 tablet, and 1440x900 desktop viewport sizes without navigation or console errors.
- Auth UX: Authority and Driver now restore valid sessions through `/api/users/me` and provide explicit logout controls; build verification passed. A valid credential session is still required for browser success-path execution.
- Latest session-lifecycle frontend commit is pushed to GitHub, but Render currently serves the previous frontend asset hash. The Render dashboard redirects to sign-in in this environment, so a user-authenticated Manual Deploy is still required before production UI rollout can be verified.

## Partial Or Data-Dependent

- Authority dashboard success flow was not completed because the documented sample authority account is not present in the local database. One login attempt correctly rejected the credentials.
- Driver dashboard success flow, GPS streaming, manual check-in, and realtime seat updates require a valid driver account assigned to a bus and browser GPS permission.
- Authority CRUD create/update/delete flows require a valid authority session. Destructive delete operations were not run during QA.
- The production dataset currently contains buses and routes, but the tested search results were offline at test time, so live movement could not be validated with a real active driver.

## Deployment

- URL: https://apnibus-fuao.onrender.com
- Git commits: `7190daa` and `80ca609`
- GitHub branch: `main`
- Render auto-deploy: completed; the new authorization behavior was observed in production.

## Remaining Actions

1. Create or confirm one authority account in MongoDB.
2. Create or confirm one driver account with matching `driverId` and bus `assignedDriverId`.
3. Run the authenticated authority CRUD matrix.
4. Run the driver GPS, stop check-in, seat update, Socket.IO reconnect, and passenger live-update matrix with a real device or mocked GPS.
5. Sign in to Render and trigger Manual Deploy for the latest `main` commit, then recheck the frontend asset hash.
