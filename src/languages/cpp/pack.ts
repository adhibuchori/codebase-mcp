/**
 * C++, tier 2: regex fallbacks for namespaces, classes, structs, enums and function definitions,
 * including out-of-class method definitions (`void OrderService::cancel(int id) {`), whose name is
 * the part after the last `::`. Like C, a definition starts at column 0 and has no `;`.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';

export const cppPack: LanguagePack = {
  id: 'cpp',
  name: 'C++',
  tier: 2,
  extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
  grammar: 'cpp',
  symbolPatterns: [
    { kind: 'module', regex: /^\s*(?:inline\s+)?namespace\s+([A-Za-z_][\w:]*)/ },
    {
      kind: 'class',
      regex:
        /^\s*(?:template\s*<.*>\s*)?class\s+(?:[A-Z_][A-Z0-9_]*\s+)?([A-Za-z_]\w*)\s*(?:final\b\s*)?(?:[:{]|$)/,
    },
    {
      kind: 'struct',
      regex:
        /^\s*(?:template\s*<.*>\s*)?struct\s+(?:[A-Z_][A-Z0-9_]*\s+)?([A-Za-z_]\w*)\s*(?:final\b\s*)?(?:[:{]|$)/,
    },
    { kind: 'enum', regex: /^\s*enum\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/ },
    {
      kind: 'function',
      regex: /^[A-Za-z_][\w \t*&:<>,]*?(?:::|[\s*&])(~?[A-Za-z_]\w*)\s*\([^;]*$/,
    },
  ],
  /** spdlog, glog and Boost.Log error calls, std::cerr, and `throw std::runtime_error(…)`. */
  logCall:
    /\bspdlog::(?:error|warn|critical)\(|\b(?:LOG|BOOST_LOG_TRIVIAL)\(\s*(?:ERROR|WARNING|FATAL|error|warning|fatal)\s*\)|\bstd::cerr\b|\bthrow\s+[\w:]+\s*[({]/,
};
