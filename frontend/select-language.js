function setLanguage(lang) {
    localStorage.setItem('selectedLanguage', lang);
    window.location.href = 'role-selection.html'; // Ab hum role-selection page par jayenge
}