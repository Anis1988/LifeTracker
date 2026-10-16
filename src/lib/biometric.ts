import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/**
 * 🔒 Fingerprint / face unlock for the Vault in the Android app (native code: android/…/BiometricPlugin.java,
 * androidx.biometric). The PIN always works too; on the website only the PIN is used.
 */
const Bio = registerPlugin<{ available(): Promise<{ ok: boolean }>; verify(o: { reason: string }): Promise<{ ok: boolean; why?: string }> }>('Biometric');
export const canBiometric = async (): Promise<boolean> => (isNative() ? (await Bio.available().catch(() => ({ ok: false }))).ok : false);
export const biometric = async (reason: string): Promise<boolean> => (isNative() ? (await Bio.verify({ reason }).catch(() => ({ ok: false }))).ok : false);
