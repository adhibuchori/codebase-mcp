#!/usr/bin/env bun
/** `bun run gen-key`: prints a new 64-character hex API key for MCP_API_KEY. */
import { randomBytes } from 'node:crypto';

console.log(randomBytes(32).toString('hex'));
