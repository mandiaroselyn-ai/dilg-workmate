// Phone fingerprint through the WorkMate Android app. The app's WebView has no WebAuthn,
// so the app signs the server's challenge with a fingerprint-locked key in the phone.
export const hasNativeBiometricBridge = () => typeof window !== 'undefined'
  && Boolean(window.ReactNativeWebView && window.dilgNativeBiometricSupported === true);

export const requestNativeBiometricSignature = (challenge, keyId) => new Promise((resolve, reject) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let timeoutId;
  const handleResult = event => {
    const detail = event.detail || {};
    if (detail.requestId !== requestId) return;
    window.clearTimeout(timeoutId);
    window.removeEventListener('dilg-biometric-result', handleResult);
    if (detail.success && detail.signature && detail.publicKey) {
      resolve({ signature: detail.signature, publicKey: detail.publicKey });
    } else {
      reject(new Error(detail.error || 'Phone fingerprint verification was cancelled.'));
    }
  };
  timeoutId = window.setTimeout(() => {
    window.removeEventListener('dilg-biometric-result', handleResult);
    reject(new Error('Fingerprint verification timed out. Please retry.'));
  }, 90000);
  window.addEventListener('dilg-biometric-result', handleResult);
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'dilg-native-biometric-auth',
      requestId,
      challenge,
      keyId
    }));
  } catch (error) {
    window.clearTimeout(timeoutId);
    window.removeEventListener('dilg-biometric-result', handleResult);
    reject(error);
  }
});
