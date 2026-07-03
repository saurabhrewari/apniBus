/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07111f',
        mist: '#e6f2ff',
        pulse: '#fb7185',
        ember: '#f97316',
        tide: '#38bdf8',
        moss: '#34d399'
      },
      boxShadow: {
        glow: '0 24px 60px rgba(56, 189, 248, 0.16)'
      }
    }
  },
  plugins: []
};
