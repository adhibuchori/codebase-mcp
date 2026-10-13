#!/usr/bin/env bun
/** `bun run config:schema`: regenerates codebase.config.schema.json from src/config/config-schema.ts. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configJsonSchema } from '../../src/config/config-schema.ts';
import { PROJECT_DIR } from '../shared/env-file.ts';

writeFileSync(join(PROJECT_DIR, 'codebase.config.schema.json'), configJsonSchema());
console.log('✅ Wrote codebase.config.schema.json');
