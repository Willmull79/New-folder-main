/**
 * Firebase Phone Auth requires a RecaptchaVerifier.
 * Use a visible widget + explicit render() — invisible often fails with
 * auth/captcha-check-failed when the widget never solved or the domain
 * is not in Authentication → Authorized domains.
 */

export function clearPhoneRecaptcha(verifier) {
    if (!verifier) return;
    try {
        verifier.clear();
    } catch (_) {
        // ignore leftover widget cleanup
    }
}

/**
 * @param {typeof window.firebase} firebaseSdk
 * @param {string} containerId
 * @param {{ onExpired?: () => void }} [options]
 */
export async function createPhoneRecaptchaVerifier(firebaseSdk, containerId, options = {}) {
    if (!firebaseSdk?.auth?.RecaptchaVerifier) {
        throw new Error('Firebase Auth is not ready.');
    }

    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error('reCAPTCHA container is missing.');
    }
    container.innerHTML = '';

    const verifier = new firebaseSdk.auth.RecaptchaVerifier(containerId, {
        size: 'normal',
        callback: () => {},
        'expired-callback': () => {
            options.onExpired?.();
        },
    });
    await verifier.render();
    return verifier;
}
