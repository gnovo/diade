/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D4F46',
          dark: '#08332D',
          light: '#156B5F',
        },
        secondary: {
          DEFAULT: '#65C5B3',
          dark: '#45A896',
          light: '#88D6C7',
        },
        accent: {
          DEFAULT: '#A7E3D6',
          dark: '#85C7BA',
          light: '#CBF0E8',
        },
        canvas: '#F7FAF9',
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#EFF6F4',
        },
        border: {
          DEFAULT: '#E2E8F0',
          subtle: '#CBD5E1',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
          light: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['PlusJakartaSans-Regular', 'system-ui', 'sans-serif'],
        medium: ['PlusJakartaSans-Medium', 'system-ui', 'sans-serif'],
        semibold: ['PlusJakartaSans-SemiBold', 'system-ui', 'sans-serif'],
        bold: ['PlusJakartaSans-Bold', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
