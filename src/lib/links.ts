import { isNative } from './native';

/**
 * 📱 "My apps": all the owner's apps on one page (apps.html, shipped with the website). In the Android app it opens
 * the website's page in the phone's browser: the other apps only answer the website (CORS), not https://localhost.
 */
export const appsUrl = () => (isNative() ? 'https://anis1988.github.io/LifeTracker/apps.html' : './apps.html');
