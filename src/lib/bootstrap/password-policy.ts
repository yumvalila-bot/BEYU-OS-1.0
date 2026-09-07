/**
 * BEYU OS — administrator password policy.
 *
 * A deliberately strict, self-contained policy for the highest-value credential
 * in the system. It is used server-side during administrator enrollment and by
 * any future governed password rotation. It never stores, logs or returns the
 * password itself; it returns only a boolean decision and generic reasons.
 */

/** Minimum length for an administrator credential. */
export const ADMIN_PASSWORD_MIN_LENGTH = 14;
export const ADMIN_PASSWORD_MAX_LENGTH = 200;

/**
 * A small, embedded list of the most trivially-guessed patterns. This is NOT a
 * breach corpus; the enrollment docs recommend a password manager and the owner
 * remains responsible for uniqueness. It exists to fail-closed on the obvious
 * defaults the task explicitly prohibits (admin, password, changeme, BEYU123…).
 */
const FORBIDDEN_SUBSTRINGS = [
  "password",
  "passw0rd",
  "changeme",
  "admin",
  "beyu",
  "qwerty",
  "letmein",
  "welcome",
  "123456",
  "iloveyou",
  "secret",
];

export type PasswordPolicyResult = { ok: true } | { ok: false; reasons: string[] };

export function evaluateAdminPassword(password: string, email?: string): PasswordPolicyResult {
  const reasons: string[] = [];

  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    reasons.push(`Must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    reasons.push(`Must be at most ${ADMIN_PASSWORD_MAX_LENGTH} characters.`);
  }

  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  if (classes < 3) {
    reasons.push("Must combine at least three of: lowercase, uppercase, digits, symbols.");
  }

  const lower = password.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((s) => lower.includes(s))) {
    reasons.push("Must not contain a common or product-related word.");
  }

  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length >= 3 && lower.includes(local)) {
      reasons.push("Must not contain your email address.");
    }
  }

  // Reject long runs of a single repeated character or trivial sequences.
  if (/(.)\1{3,}/.test(password)) {
    reasons.push("Must not repeat the same character four or more times in a row.");
  }

  // Require a reasonable amount of distinct characters (weak entropy proxy).
  if (new Set(password).size < 8) {
    reasons.push("Must use at least eight distinct characters.");
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
