/**
 * The C# language pack: regex symbols for when the grammar is unavailable, ASP.NET Core, HttpClient,
 * Kafka and gRPC routes, the project-file references that reveal a framework, and the logger and
 * throw calls that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { aspnetRoutes } from './routes.ts';

const PROJECT_FILE = /\.csproj$/;

export const csharpPack: LanguagePack = {
  id: 'csharp',
  name: 'C#',
  tier: 1,
  extensions: ['.cs'],
  grammar: 'csharp',
  symbolPatterns: [
    {
      kind: 'class',
      regex:
        /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|file|new|unsafe)\s+)*class\s+(\w+)/,
    },
    {
      kind: 'interface',
      regex: /^\s*(?:(?:public|private|protected|internal|partial|file)\s+)*interface\s+(\w+)/,
    },
    {
      kind: 'record',
      regex:
        /^\s*(?:(?:public|private|protected|internal|sealed|abstract|partial|readonly|file)\s+)*record\s+(?:class\s+|struct\s+)?(\w+)/,
    },
    {
      kind: 'struct',
      regex:
        /^\s*(?:(?:public|private|protected|internal|readonly|ref|partial|file|unsafe)\s+)*struct\s+(\w+)/,
    },
    { kind: 'enum', regex: /^\s*(?:(?:public|private|protected|internal|file)\s+)*enum\s+(\w+)/ },
    {
      kind: 'method',
      regex:
        /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\s+)+[\w.]+(?:<[^()]*?>)?(?:\[\])*\??\s+(\w+)(?:\s*<[^()]*?>)?\s*\(/,
    },
  ],
  routeExtractors: [aspnetRoutes],
  frameworks: [
    {
      file: PROJECT_FILE,
      contains: /Microsoft\.AspNetCore|Sdk="Microsoft\.NET\.Sdk\.Web"/,
      name: 'aspnetcore',
    },
    { file: PROJECT_FILE, contains: /Grpc\.AspNetCore/, name: 'grpc-aspnetcore' },
    { file: PROJECT_FILE, contains: /Confluent\.Kafka/, name: 'confluent-kafka' },
    { file: PROJECT_FILE, contains: /MassTransit/, name: 'masstransit' },
  ],
  logCall:
    /\b_?[lL]og(?:ger)?\s*\.\s*(?:Log(?:Trace|Debug|Information|Warning|Error|Critical)?|Verbose|Debug|Information|Info|Warning|Warn|Error|Fatal)\s*\(|\bthrow\s+new\s+[\w.]+\s*\(/,
};
