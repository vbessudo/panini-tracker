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
        rose:   '#953A67',
        blush:  '#DDC6D0',
        blushLight: '#EAD1DC',
        // Semantic states
        pegada: '#16A34A',
        tengo:  '#D97706',
        falta:  '#9CA3AF',
        // Owner colors
        simon: '#60A5FA',
        paul:  '#65A30D',
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
