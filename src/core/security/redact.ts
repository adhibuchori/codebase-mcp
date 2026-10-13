/**
 * Secret redaction for every text the server returns. Sensitive files are already blocked by name;
 * this catches credentials that sit inside ordinary source and config files. The shapes follow the
 * well-known token formats (the same families gitleaks ships rules for).
 */
const MASK = '[REDACTED]';

const TOKEN_SHAPES: readonly RegExp[] = [
  /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bsk_(live|test)_[0-9a-zA-Z]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{32,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

const PRIVATE_KEY =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g;

/** key = "value" / key: 'value' where the key names a secret; the key stays, the value goes. */
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*\s*[:=]\s*)(["'])([^"'\n]{6,})\2/gi;

/** user:password@host in a connection string. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{3,})@/gi;

export function redactSecrets(text: string): string {
  let out = text.replace(PRIVATE_KEY, `-----BEGIN PRIVATE KEY----- ${MASK}`);
  for (const shape of TOKEN_SHAPES) out = out.replace(shape, MASK);
  out = out.replace(
    ASSIGNMENT,
    (_all, key: string, quote: string) => `${key}${quote}${MASK}${quote}`,
  );
  return out.replace(URL_CREDENTIALS, (_all, prefix: string) => `${prefix}${MASK}@`);
}
