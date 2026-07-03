document.addEventListener('DOMContentLoaded', () => {
    // Select all necessary elements
    const tabButtons = document.querySelectorAll('.tab-btn');
    const formHeaderTitle = document.querySelector('.form-header h1');
    const mainButton = document.querySelector('.login-btn');
    const nameInput = document.querySelector('#username-input');
    const emailInput = document.querySelector('#email-input');
    const passwordInput = document.querySelector('#password-field');
    
    let currentMode = 'login'; // Initial mode is 'login'

    // Logic for switching tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            currentMode = button.getAttribute('data-tab');

            // Change Title and Button text based on the mode
            if (currentMode === 'signup') {
                formHeaderTitle.textContent = 'Sign Up';
                mainButton.textContent = 'Sign Up';
            } else {
                formHeaderTitle.textContent = 'Login';
                mainButton.textContent = 'Login';
            }
        });
    });

    // Logic for the main button click
    mainButton.addEventListener('click', async (event) => {
        event.preventDefault(); // Stop the form from submitting

        // Get data from the form
        const name = nameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;

        if (currentMode === 'signup') {
            // --- SIGN UP LOGIC ---
            if (!name || !email || !password) {
                return alert('Please fill all fields');
            }

            try {
                const response = await fetch('http://localhost:5001/api/users/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.msg || 'Something went wrong');
                alert('Registration successful! Please login.');
                window.location.reload();
            } catch (error) {
                console.error('Registration Error:', error);
                alert(error.message);
            }

        } else {
            // --- LOGIN LOGIC ---
            if (!email || !password) {
                return alert('Please enter email and password');
            }

            try {
                const response = await fetch('http://localhost:5001/api/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.msg || 'Invalid Credentials');

                // If login is successful, save the user's name
                localStorage.setItem('loggedInUserName', data.user.name);

                // Redirect to the dashboard
                window.location.href = 'driver-dashboard.html';

            } catch (error) {
                console.error('Login Error:', error);
                alert(error.message);
            }
        }
    });
});