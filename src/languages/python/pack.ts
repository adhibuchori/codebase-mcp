/**
 * Python, tier 1: regex fallbacks for classes and functions (a `def` inside a class becomes a
 * method when the symbol tree is built), FastAPI/Flask/Django/Kafka/gRPC routes, frameworks named
 * in requirements files, pyproject.toml, Pipfile or setup.py, and the logger and raise statements
 * that rank log-source candidates.
 */
import type { FrameworkRule, LanguagePack } from '../../core/model/language-pack.types.ts';
import { escapeRegex } from '../../core/security/safe-regex.ts';
import { pythonRoutes } from './routes.ts';

const BUILD_FILE =
  /(?:^|\/)(?:requirements[\w.-]*\.txt|requirements\/[\w.-]+\.txt|pyproject\.toml|Pipfile|setup\.py|setup\.cfg)$/;

/** A requirement line (`fastapi==0.110`, `Django>=5`) or a quoted entry (`"flask>=3",`). */
function requirement(name: string, framework = name): FrameworkRule {
  return {
    file: BUILD_FILE,
    contains: new RegExp(`(?:^\\s*|["'])${escapeRegex(name)}(?![\\w-])`, 'im'),
    name: framework,
  };
}

export const pythonPack: LanguagePack = {
  id: 'python',
  name: 'Python',
  tier: 1,
  extensions: ['.py', '.pyi'],
  grammar: 'python',
  symbolPatterns: [
    { kind: 'class', regex: /^\s*class\s+([A-Za-z_]\w*)/ },
    { kind: 'function', regex: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
  ],
  routeExtractors: [pythonRoutes],
  frameworks: [
    requirement('fastapi'),
    requirement('flask'),
    requirement('django'),
    requirement('celery'),
    requirement('kafka-python'),
    requirement('confluent-kafka'),
    requirement('grpcio', 'grpc-python'),
  ],
  logCall:
    /\b_?(?:log|logger|logging|LOG|LOGGER)\.(?:debug|info|warning|warn|error|exception|critical|fatal)\(|\braise\s+[A-Za-z_][\w.]*\(/,
};
