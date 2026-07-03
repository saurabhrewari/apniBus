document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('main-search-form');
    if (!searchForm) {
        console.error("Search form not found! Check your HTML id.");
        return;
    }

    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const fromInput = document.getElementById('from-stand-input');
        const toInput = document.getElementById('to-stand-input');
        
        const fromValue = fromInput.value.trim();
        const toValue = toInput.value.trim();

        if (!fromValue || !toValue) {
            return alert('Please fill in both From and To fields.');
        }

        try {
            const response = await fetch('http://localhost:5001/api/journey/findbus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: fromValue, to: toValue })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ msg: `Server responded with status: ${response.status}` }));
                throw new Error(errorData.msg);
            }
            
            const buses = await response.json();
            
            sessionStorage.setItem('searchResults', JSON.stringify(buses));
            window.location.href = 'search-results.html';

        } catch (error) {
            console.error('Error finding buses:', error);
            alert(`Failed to find buses: ${error.message}`);
        }
    });
});