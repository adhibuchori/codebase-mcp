; Call graph for JavaScript and TypeScript (our own query): imports, require, calls and `new`.
; Shared by the javascript, typescript and tsx packs; see src/core/graph/file-graph.ts.

(import_statement (import_clause (identifier) @import.default) source: (string (string_fragment) @import.source))
(import_statement (import_clause (named_imports (import_specifier name: (_) @import.name !alias))) source: (string (string_fragment) @import.source))
(import_statement (import_clause (named_imports (import_specifier name: (_) @import.name alias: (_) @import.alias))) source: (string (string_fragment) @import.source))
(import_statement (import_clause (namespace_import (identifier) @import.namespace)) source: (string (string_fragment) @import.source))


(call_expression function: (identifier) @call.name)
(call_expression function: (member_expression object: (_) @call.receiver property: (property_identifier) @call.name))
(new_expression constructor: (_) @new)

(variable_declarator name: (identifier) @bind.name value: (new_expression constructor: (_) @bind.value))

(variable_declarator name: (identifier) @import.namespace
  value: (call_expression function: (identifier) @_require arguments: (arguments . (string (string_fragment) @import.source)))
  (#eq? @_require "require"))
