import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4A1A3B',
          dark: '#3a1330',
          light: '#5e2150',
        },
        accent: '#65163D',
        // Semantic states
        pegada: '#16A34A',   // green-600
        tengo: '#D97706',    // amber-600
        falta: '#9CA3AF',    // gray-400
        // Owner colors
        simon: '#60A5FA',    // blue-400 — light blue
        paul:  '#65A30D',    // lime-600 — olive green
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
