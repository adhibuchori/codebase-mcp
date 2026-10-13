import { describe, expect, test } from "bun:test";
import { isSensitiveName } from "./security.js";

describe("env files are always blocked", () => {
  test.each([
    ".env", ".ENV", ".env.local", ".env.production", ".env.example", ".env.sample",
    ".env-prod", ".env_backup", ".envrc", "prod.env", "app.env", "config.env.bak",
  ])("%s", (name) => expect(isSensitiveName(name)).toBe(true));
});

describe("Windows tricks that open an env file are blocked", () => {
  test.each([".env.", ".env ", ".env::$DATA", ".env.local:stream", "x:.env"])("%s", (name) =>
    expect(isSensitiveName(name)).toBe(true)
  );
});

describe("other secrets stay blocked", () => {
  test.each([
    "server.pem", "private.key", "id_rsa", "id_ed25519.pub", ".npmrc", "credentials.json",
    "client_secret.json", "application-prod.yml", "GoogleService-Info.plist", "key.pem.",
  ])("%s", (name) => expect(isSensitiveName(name)).toBe(true));
});

describe("normal source files are allowed", () => {
  test.each([
    "env.js", "server.js", "README.md", "vite-env.d.ts", "dotenv.config.js", "environment.ts",
    "x.envelope", "package.json", "Dockerfile",
  ])("%s", (name) => expect(isSensitiveName(name)).toBe(false));
});

test("EXTRA_BLOCKED patterns are applied", () => {
  expect(isSensitiveName("dump.sql", [/\.sql$/i])).toBe(true);
  expect(isSensitiveName("schema.prisma", [/\.sql$/i])).toBe(false);
});
