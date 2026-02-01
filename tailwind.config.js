/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--primary-glow))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          elevated: 'hsl(var(--card-elevated))',
        },
        // Tech palette
        'tech-dark': 'hsl(var(--tech-dark))',
        'tech-darker': 'hsl(var(--tech-darker))',
        'tech-navy': 'hsl(var(--tech-navy))',
        'tech-blue': 'hsl(var(--tech-blue))',
        'tech-cyan': 'hsl(var(--tech-cyan))',
        'tech-electric': 'hsl(var(--tech-electric))',
        'tech-glow': 'hsl(var(--tech-glow))',
        'tech-accent': 'hsl(var(--tech-accent))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 16px)',
      },
      boxShadow: {
        'glow': '0 0 20px hsl(186 100% 50% / 0.3)',
        'glow-lg': '0 0 40px hsl(186 100% 50% / 0.4)',
        'glow-blue': '0 0 20px hsl(217 91% 60% / 0.3)',
        'glow-blue-lg': '0 0 40px hsl(217 91% 60% / 0.4)',
        'card': '0 4px 20px hsl(220 20% 4% / 0.3)',
        'card-lg': '0 8px 40px hsl(220 20% 4% / 0.4)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, hsl(217 33% 14% / 0.6) 0%, hsl(220 25% 8% / 0.8) 100%)',
        'hero-gradient': 'linear-gradient(180deg, hsl(220 20% 4%) 0%, hsl(220 25% 8%) 50%, hsl(217 33% 14%) 100%)',
      },
      animation: {
        'in': 'animate-in 0.3s ease-out',
        'fade-up': 'fade-up 0.5s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
};