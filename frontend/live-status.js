document.addEventListener('DOMContentLoaded', () => {
    const busNumberDisplay = document.querySelector('#bus-number-display');
    const busRouteDisplay = document.querySelector('#bus-route-display');
    let currentBusNumber = null; // Variable to store the bus number

    async function fetchActiveJourneyStatus() {
        try {
            const response = await fetch('http://localhost:5001/api/journey/status');
            if (!response.ok) throw new Error('Could not fetch journey status.');
            const journeyData = await response.json();
            
            currentBusNumber = journeyData.busNumber; // Save the bus number

            busNumberDisplay.textContent = journeyData.busNumber;
            const routeString = journeyData.stops.map(stop => stop.name).join(' → ');
            busRouteDisplay.textContent = routeString;
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    }

    fetchActiveJourneyStatus();

    // --- Seat Button Logic (UPDATED) ---
    const seatButtons = document.querySelectorAll('.seat-btn');
    seatButtons.forEach(button => {
        button.addEventListener('click', async () => {
            if (!currentBusNumber) return alert('Bus data not loaded yet.');

            seatButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const seats = button.getAttribute('data-value');

            try {
                await fetch('http://localhost:5001/api/journey/seats', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ busNumber: currentBusNumber, seats: parseInt(seats) })
                });
                console.log('Seat count updated to', seats);
            } catch (error) {
                console.error('Failed to update seats:', error);
                alert('Failed to update seat count.');
            }
        });
    });

    // --- End Journey Button Logic (UPDATED) ---
    const endJourneyBtn = document.querySelector('.end-journey-btn');
    endJourneyBtn.addEventListener('click', async () => {
        if (!currentBusNumber) return alert('Bus data not loaded yet.');
        
        try {
            await fetch('http://localhost:5001/api/journey/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ busNumber: currentBusNumber })
            });
            alert('Journey Ended Successfully!');
            window.location.href = 'driver-dashboard.html'; // Redirect to dashboard
        } catch (error) {
            console.error('Failed to end journey:', error);
            alert('Failed to end journey.');
        }
    });
});