/**
 * 🔒 Fingerprint / face unlock for the Vault: only in the Android app (branch "android" has the real one).
 * On the website the PIN is used.
 */
export const canBiometric = async (): Promise<boolean> => false;
export const biometric = async (_reason: string): Promise<boolean> => false;
