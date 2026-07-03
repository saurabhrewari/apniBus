// This function runs when the page is fully loaded
window.addEventListener('load', () => {
    const splashScreen = document.querySelector('.splash-screen');
    const mainContent = document.querySelector('#main-content');

    // Wait for a moment before starting the splash screen fade-out
    setTimeout(() => {
        splashScreen.classList.add('hidden');

        // Wait for the fade-out to finish before removing the splash screen
        splashScreen.addEventListener('transitionend', () => {
            splashScreen.remove();
            // Make the language selection content visible
            mainContent.style.opacity = '1';
        }, { once: true });

    }, 1500); // How long the splash screen is visible (in milliseconds)
});

// This function is called when a language button is clicked
function setLanguage(lang) {
    localStorage.setItem('selectedLanguage', lang);
    window.location.href = 'role-selection.html'; // Yahan badlav kiya gaya hai
}