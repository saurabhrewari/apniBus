document.addEventListener('DOMContentLoaded', () => {
    // 1. Browser ki memory (localStorage) se save kiya hua naam nikalein
    const savedName = localStorage.getItem('loggedInUserName');

    // 2. Agar naam save kiya hua mila hai
    if (savedName) {
        // 3. Un sabhi jagahon ko select karein jahan naam dikhana hai
        const nameElements = document.querySelectorAll('.user-name');
        
        // 4. Har jagah "Gurpreet Singh" ki jagah save kiya hua naam daal dein
        nameElements.forEach(element => {
            element.textContent = savedName;
        });
    }
});