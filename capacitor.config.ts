import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app (branch "android"): the same screens as the website, talking to the same Supabase. */
const config: CapacitorConfig = {
  appId: 'app.lifetracker',
  appName: 'LifeTracker',
  webDir: 'build',
  backgroundColor: '#070b14',
  plugins: {
    // Follow the phone's light/dark setting for the clock and battery icons; the screens draw under them.
    SystemBars: { style: 'DEFAULT', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
