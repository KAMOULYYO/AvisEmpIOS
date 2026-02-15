/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        metroRed: '#E10600',
        metroDarkRed: '#A80000'
      },
      boxShadow: {
        smooth: '0 10px 30px rgba(15, 23, 42, 0.08)',
        lift: '0 18px 42px rgba(225, 6, 0, 0.16)'
      }
    }
  },
  plugins: []
};
