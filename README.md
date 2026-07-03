# ApniBus

ApniBus is a bus tracking prototype built with React, Node.js, Express, MongoDB, Socket.io, and Leaflet. The app is organized around three roles:

- Passenger: search buses and track route progress without login.
- Driver: start a shift, stream GPS location, and manually check in at stops.
- Authority: manage buses, routes, assignments, and fleet overview.

## Project Structure

```text
apniBus/
  backend/
    models/
    routes/
    utils/
    server.js
    package.json
  frontend/
    src/
      components/
      pages/
      lib/
    package.json
```

## Requirements

- Node.js
- npm
- MongoDB connection string

The backend reads MongoDB from `backend/.env`.

Example:

```env
MONGO_URI=mongodb://127.0.0.1:27017/apnibus
JWT_SECRET=change-this-secret
REQUIRE_AUTH=false
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=180
RATE_LIMIT_WINDOW_MS=60000
BUS_OFFLINE_AFTER_MS=180000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For MongoDB Atlas, use your Atlas URI instead.

Set `REQUIRE_AUTH=true` when you want protected management APIs to require a valid login token. In development, leaving it false keeps older manual/API workflows working.

## Install Dependencies

Run these once:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

## Run The App

Open two terminals.

Terminal 1:

```bash
cd backend
npm start
```

Backend runs at:

```text
http://localhost:5001
```

Health check:

```http
GET http://localhost:5001/api/health
```

The gateway page also shows backend and MongoDB status automatically.

Terminal 2:

```bash
cd frontend
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

Open:

```text
http://localhost:5173
```

## Docker Run

For a production-like local run with MongoDB included:

```bash
docker compose up --build
```

Docker frontend:

```text
http://localhost:5173
```

Docker backend:

```text
http://localhost:5001
```

## Test

Backend tests:

```bash
cd backend
npm test
```

## App Pages

```text
/              Role selection gateway
/passenger     Passenger search dashboard
/search-results Search result cards
/live-status   Vertical route tracker
/driver        Driver console
/authority     Authority dashboard
```

## Data Entry Order

Add data in this order:

1. Stops / stations
2. Routes
3. Buses
4. Schedules
5. Users

You can use Postman, Thunder Client, curl, or the Authority dashboard where available.

## 1. Add Stops / Stations

Endpoint:

```http
POST http://localhost:5001/api/data/stops
```

Body:

```json
{
  "stopName": "Rewari Stand",
  "latitude": 28.197,
  "longitude": 76.617
}
```

More examples:

```json
{
  "stopName": "Dharuhera",
  "latitude": 28.205,
  "longitude": 76.796
}
```

```json
{
  "stopName": "Manesar",
  "latitude": 28.351,
  "longitude": 76.94
}
```

```json
{
  "stopName": "Gurgaon Bus Stand",
  "latitude": 28.459,
  "longitude": 77.026
}
```

List stops:

```http
GET http://localhost:5001/api/data/stops
```

## 2. Add Routes

Endpoint:

```http
POST http://localhost:5001/api/data/routes
```

Body:

```json
{
  "routeNumber": "Route_101",
  "origin": "Rewari Stand",
  "destination": "Gurgaon Bus Stand",
  "stops": [
    "Rewari Stand",
    "Dharuhera",
    "Manesar",
    "Gurgaon Bus Stand"
  ],
  "segmentDistancesKm": [18, 24, 15]
}
```

Important: stop names must exactly match existing stop names.

List routes:

```http
GET http://localhost:5001/api/data/routes
```

## 3. Add Buses

Endpoint:

```http
POST http://localhost:5001/api/buses
```

Body:

```json
{
  "busNumber": "HR47-1001",
  "model": "Tata Starbus",
  "busType": "AC",
  "totalSeats": 42,
  "seatsAvailable": 42,
  "routeNumber": "Route_101",
  "assignedDriverId": "DRIVER_001"
}
```

List buses:

```http
GET http://localhost:5001/api/buses
```

Update a bus:

```http
PATCH http://localhost:5001/api/buses/BUS_ID
```

Example body:

```json
{
  "routeNumber": "Route_101",
  "assignedDriverId": "DRIVER_002",
  "seatsAvailable": 30
}
```

Delete a bus:

```http
DELETE http://localhost:5001/api/buses/BUS_ID
```

## 4. Add Schedules

Endpoint:

```http
POST http://localhost:5001/api/data/schedules
```

Body:

```json
{
  "busNumber": "HR47-1001",
  "routeNumber": "Route_101",
  "schedules": [
    {
      "stopName": "Rewari Stand",
      "arrivalTime": "08:00",
      "departureTime": "08:05"
    },
    {
      "stopName": "Dharuhera",
      "arrivalTime": "08:30",
      "departureTime": "08:32"
    },
    {
      "stopName": "Manesar",
      "arrivalTime": "09:05",
      "departureTime": "09:07"
    },
    {
      "stopName": "Gurgaon Bus Stand",
      "arrivalTime": "09:35",
      "departureTime": "09:35"
    }
  ]
}
```

## 5. Add Users / Passwords

Register user:

```http
POST http://localhost:5001/api/users/register
```

Body:

```json
{
  "name": "Authority Admin",
  "email": "admin@apnibus.com",
  "password": "Admin12345",
  "role": "authority"
}
```

Register driver:

```http
POST http://localhost:5001/api/users/register
```

Body:

```json
{
  "name": "Driver One",
  "email": "DRIVER_001@apnibus.local",
  "password": "Driver12345",
  "role": "driver",
  "driverId": "DRIVER_001"
}
```

Login:

```http
POST http://localhost:5001/api/users/login
```

Body:

```json
{
  "email": "admin@apnibus.com",
  "password": "Admin12345"
}
```

Login returns a token. The frontend stores it in `localStorage` as `apnibus.authToken` and sends it as a Bearer token on API requests.

Driver login uses the driver email. If the driver enters `DRIVER_001`, the frontend tries `DRIVER_001@apnibus.local`.

Passwords must be at least 8 characters and include both letters and numbers. After repeated failed login attempts, the account is temporarily locked.

## Search API

Search by bus number, route name, or stop:

```http
GET http://localhost:5001/api/search?query=Rewari
```

Search station-to-station:

```http
GET http://localhost:5001/api/search?from=Rewari%20Stand&to=Gurgaon%20Bus%20Stand
```

Nearby stops:

```http
GET http://localhost:5001/api/search/nearby-stops?latitude=28.2&longitude=76.7
```

## Socket.io Flow

Driver sends live location with:

```js
socket.emit('send-location', {
  driverId: 'DRIVER_001',
  busNumber: 'HR47-1001',
  routeNumber: 'Route_101',
  latitude: 28.205,
  longitude: 76.796
});
```

Passenger joins a route room:

```js
socket.emit('join-route', 'Route_101');
```

Server broadcasts processed route progress:

```js
socket.on('route-location', (payload) => {
  console.log(payload.eta);
});
```

Manual driver stop check-in:

```js
socket.emit('manual-check-in', {
  busNumber: 'HR47-1001',
  routeNumber: 'Route_101',
  stopIndex: 1
});
```

Live seat update:

```js
socket.emit('seat-update', {
  busNumber: 'HR47-1001',
  routeNumber: 'Route_101',
  delta: 1
});
```

The server broadcasts updated seat data to passenger, driver, and authority dashboards:

```js
socket.on('bus-state', (payload) => {
  console.log(payload.occupiedSeats, payload.seatsAvailable);
});
```

Stop a trip:

```js
socket.emit('stop-trip', {
  driverId: 'DRIVER_001',
  busNumber: 'HR47-1001',
  routeNumber: 'Route_101'
});
```

The first live location update creates a `Trip` record. GPS updates are stored in `LocationHistory` with a 30-day TTL index. If a bus does not send GPS for `BUS_OFFLINE_AFTER_MS`, the backend marks the bus offline and closes the running trip as offline.

## Analytics API

Fleet overview:

```http
GET http://localhost:5001/api/analytics/overview
```

Returns active buses, online/offline counts, route performance, occupancy rate, delayed buses, and seat totals.

Operations APIs:

```http
GET http://localhost:5001/api/operations/trips
GET http://localhost:5001/api/operations/audit-logs
GET http://localhost:5001/api/operations/location-history
```

These endpoints are designed for the Authority dashboard and return trip lifecycle records, admin/driver audit events, and recent GPS history.

Data quality audit:

```http
GET http://localhost:5001/api/analytics/data-quality
```

Returns missing stop coordinates, routes without stops, buses without routes, schedule gaps, inactive buses, and duplicate route stops. The Authority dashboard shows this as the Operations Quality panel.

## Authority Dashboard Features

The `/authority` dashboard can now manage:

- buses
- stops/stations
- routes
- schedules
- driver assignment
- bus-to-route assignment
- bus active/inactive state
- live fleet map
- fleet analytics cards
- recent trips panel
- audit trail panel
- operations data-quality panel

Route editing works by selecting `Edit` on an existing route, changing the form, and saving the same route number again.

## Industrial Reliability Layer

The backend now includes:

- request IDs and structured request logs
- security headers
- in-memory rate limiting for `/api`
- configurable CORS allowlist through `CORS_ORIGINS`
- stricter password policy and temporary account lock
- audit logs for user, bus, stop, route, schedule, seat, and check-in actions
- trip/session records for driver runs
- location history with geospatial index and 30-day TTL cleanup
- automatic bus offline detection
- protected operations APIs for Authority
- backend unit tests for route tracking math and coordinate validation
- frontend route code-splitting
- PWA manifest and service worker for app-shell offline loading

For production deployment, keep `REQUIRE_AUTH=true`, use a strong `JWT_SECRET`, restrict CORS to your deployed frontend domain, and run the Node server behind a process manager such as PM2 or Docker.

## ETA Logic

The backend uses the Haversine formula to calculate distance from the bus location to the next stop:

```text
d = 2r * asin(sqrt(
  sin²((lat2 - lat1) / 2)
  + cos(lat1) * cos(lat2) * sin²((lon2 - lon1) / 2)
))
```

ETA is calculated using:

```text
ETA = distance / average speed
```

The frontend displays this as a vertical route stepper on the Live Status page.

## Common Issues

If the frontend cannot connect:

- Make sure backend is running on port `5001`.
- Check `frontend/src/config.js`.
- Make sure MongoDB is connected.

If search results are empty:

- Add stops first.
- Add a route with those exact stop names.
- Add a bus assigned to that route.
- Add schedules for that bus and route.

If ETA is missing:

- The bus needs a current location.
- Stops need latitude and longitude.
- The bus must be assigned to a route with ordered stops.
