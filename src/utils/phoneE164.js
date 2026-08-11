/**
 * Normalize a user-entered phone number to E.164 for Firebase Auth.
 * Defaults to US (+1) when no country code is present.
 *
 * Accepts common US forms:
 *   (555) 123-4567, 555-123-4567, 5551234567, 15551234567, +15551234567
 *
 * @param {string} input
 * @param {{ defaultCountry?: 'US' }} [options]
 * @returns {{ ok: true, e164: string } | { ok: false, reason: 'empty' | 'invalid' }}
 */
export function normalizePhoneToE164(input, options = {}) {
    const defaultCountry = options.defaultCountry || 'US';
    const raw = String(input || '').trim();
    if (!raw) {
        return { ok: false, reason: 'empty' };
    }

    if (raw.startsWith('+')) {
        const digits = raw.slice(1).replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) {
            return { ok: false, reason: 'invalid' };
        }
        return { ok: true, e164: `+${digits}` };
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) {
        return { ok: false, reason: 'invalid' };
    }

    if (defaultCountry === 'US') {
        if (digits.length === 10) {
            return { ok: true, e164: `+1${digits}` };
        }
        if (digits.length === 11 && digits.startsWith('1')) {
            return { ok: true, e164: `+${digits}` };
        }
    }

    // International without leading +: country code + national number (11–15 digits)
    if (digits.length >= 11 && digits.length <= 15) {
        return { ok: true, e164: `+${digits}` };
    }

    return { ok: false, reason: 'invalid' };
}

export const PHONE_FORMAT_HINT =
    'US numbers: (555) 123-4567 or 5551234567. Or include country code, e.g. +15551234567.';
