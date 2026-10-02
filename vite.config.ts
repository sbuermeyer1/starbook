/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Rules tests need the Firestore emulator; they run via `npm run test:rules`.
    exclude: ['**/node_modules/**', 'tests/rules/**'],
  },
})
