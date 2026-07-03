document.addEventListener('DOMContentLoaded', () => {
    const startJourneyBtn = document.querySelector('.start-journey-btn');
    const busNumberInput = document.querySelector('#bus-number');
    const busRouteInput = document.querySelector('#bus-route');

    if (startJourneyBtn) {
        startJourneyBtn.addEventListener('click', async () => {
            const busNumber = busNumberInput.value.trim();
            const busRoute = busRouteInput.value.trim(); // This is the full route string
            
            if (!busNumber || !busRoute) {
                alert('Please fill in both the Bus Number and the Bus Route.');
                return;
            }

            try {
                // We only need this ONE API call
                const response = await fetch('http://localhost:5001/api/journey/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // We now send both busNumber and busRoute, which the backend expects
                    body: JSON.stringify({ busNumber, busRoute })
                });

                const data = await response.json();
                
                if (!response.ok) {
                   throw new Error(data.msg || 'Failed to start journey.');
                }

                alert('Journey started successfully!');
                // Redirect to the live status page
                window.location.href = 'live-status.html';

            } catch (error) {
                console.error('Error:', error);
                alert('Error: ' + error.message);
            }
        });
    }
});