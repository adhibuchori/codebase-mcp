/** File and folder names the MCP server must never expose: env files, keys, and credentials. */

/** Any env file: .env, .env.local, .env.example, .env-prod, .env_backup, .envrc, prod.env, app.env.bak */
const ENV_FILE = /^\.env|\.env$|\.env\./;

const SENSITIVE = [
  /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /\.jks$/, /\.keystore$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, /^\.npmrc$/, /^\.pypirc$/, /^\.netrc$/,
  /credentials/, /secret/, /^\.git-credentials$/, /^google-services\.json$/, /^googleservice-info\.plist$/,
  /^application-(prod|production)\.(ya?ml|properties)$/,
];

/** Windows opens ".env." and ".env " as ".env", and "name:stream" as "name", so check those forms too */
function nameForms(name) {
  const lower = name.toLowerCase();
  const trimmed = lower.replace(/[. ]+$/, "");
  return [lower, trimmed, trimmed.split(":")[0]];
}

/** True if a single path segment (file or folder name) must not be listed, searched, or read. */
export function isSensitiveName(name, extraPatterns = []) {
  return nameForms(name).some(
    (n) => ENV_FILE.test(n) || SENSITIVE.some((re) => re.test(n)) || extraPatterns.some((re) => re.test(n))
  );
}
