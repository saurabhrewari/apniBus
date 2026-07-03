document.addEventListener('DOMContentLoaded', () => {
    const resultsList = document.getElementById('results-list');
    
    // Get the search results from the browser's session memory
    const resultsData = JSON.parse(sessionStorage.getItem('searchResults'));

    if (!resultsData || resultsData.length === 0) {
        resultsList.innerHTML = '<p style="text-align:center;">No buses found for this route.</p>';
        return;
    }

    resultsData.forEach(bus => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const statusClass = bus.isJourneyActive ? 'status-running' : 'status-stopped';
        const statusText = bus.isJourneyActive ? 'Running' : 'Not Started';

        // Only show the track button if the journey is active
        const trackButtonHTML = bus.isJourneyActive 
            ? `<a href="passenger-track-bus.html" class="track-btn">Track Bus</a>`
            : `<a href="#" class="track-btn disabled">Not Running</a>`;

        card.innerHTML = `
            <div class="card-header">${bus.busNumber}</div>
            <div class="card-body">
                <div class="timing-info">
                    <div class="time-block">
                        <span>${bus.departureTime || 'N/A'}</span><br>
                        <label>${bus.stops[0].name}</label>
                    </div>
                    <div class="timeline">→</div>
                    <div class="time-block">
                        <span>${bus.arrivalTime || 'N/A'}</span><br>
                        <label>${bus.stops[bus.stops.length - 1].name}</label>
                    </div>
                </div>
                <div class="status-info">
                    <div class="status-item">
                        <span class="${statusClass}">${statusText}</span><br>
                        <label>Status</label>
                    </div>
                    <div class="status-item">
                        <span>${bus.seatsAvailable}</span><br>
                        <label>Seats</label>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                ${trackButtonHTML}
            </div>
        `;
        resultsList.appendChild(card);
    });
});