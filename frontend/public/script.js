const socket = io();

// Icon paths are now correct
const busIcon = L.icon({ iconUrl: '/public/images/bus.png', iconSize: [38, 38] });
const userIcon = L.icon({ iconUrl: '/public/images/pin.png', iconSize: [32, 32] });

const map = L.map("map");
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "ApniBUS"
}).addTo(map);

let busMarker = null;
let userMarker = null;
let routingControl = null;

// This function will run once to set up the user's location
function setupUserLocation() {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const userLatLng = L.latLng(latitude, longitude);
            
            map.setView(userLatLng, 13); // Center map on user
            
            if (!userMarker) {
                userMarker = L.marker(userLatLng, { icon: userIcon }).addTo(map);
            } else {
                userMarker.setLatLng(userLatLng);
            }
        },
        (error) => {
            console.error("Could not get user location.", error);
            map.setView([28.6139, 77.2090], 13); // Default to Delhi
        }
    );
}

// Set up the user's location when the page loads
setupUserLocation();


// This listener now ONLY handles the BUS location
socket.on("receive-location", (data) => {
    // This is the BUS's actual location from the server
    const busLatLng = L.latLng(data.latitude, data.longitude);
    
    // Update the bus marker's position
    if (!busMarker) {
        busMarker = L.marker(busLatLng, { icon: busIcon }).addTo(map);
    } else {
        busMarker.setLatLng(busLatLng);
    }

    // Now, get the user's current marker position for the route
    if (userMarker) {
        const userLatLng = userMarker.getLatLng();

        // Create or update the route between the user and the bus
        if (!routingControl) {
            routingControl = L.Routing.control({
                waypoints: [userLatLng, busLatLng],
                addWaypoints: false,
                draggableWaypoints: false,
                createMarker: function() { return null; } // Hide default markers
            }).on('routesfound', function(e) {
                updateInfoPanel(e.routes[0].summary);
            }).addTo(map);
        } else {
            routingControl.setWaypoints([userLatLng, busLatLng]);
        }
    }
});

function updateInfoPanel(summary) {
    const distanceKm = (summary.totalDistance / 1000).toFixed(2);
    document.getElementById('distance').innerText = `${distanceKm} km`;

    const totalSeconds = summary.totalTime;
    const minutes = Math.floor(totalSeconds / 60);
    document.getElementById('eta').innerText = `${minutes} min`;
}