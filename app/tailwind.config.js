/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './consumer.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // DPP Studio palette derived from the mockups (green/olive on warm beige).
        brand: {
          50: '#f3f7ee',
          100: '#e4eed6',
          200: '#cadfae',
          300: '#a8c97e',
          400: '#84ad52',
          500: '#5f8d34',
          600: '#2f5e1f', // primary action green
          700: '#274d1c',
          800: '#213f1a',
          900: '#1d3518'
        },
        canvas: '#f4f3ee', // warm beige page background
        card: '#ffffff',
        ink: {
          DEFAULT: '#1f2421',
          muted: '#6b7280'
        }
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
