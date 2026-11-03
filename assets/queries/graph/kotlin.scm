; Call graph for Kotlin (our own query): package, imports, supertypes, calls, constructions (a
; capitalised call) and the declared types of parameters and properties.

(package_header (qualified_identifier) @package)
(import (qualified_identifier) @import.qualified) @import.statement

(class_declaration name: (identifier) @type.name
  (delegation_specifiers (delegation_specifier (constructor_invocation (user_type) @extends))))
(class_declaration name: (identifier) @type.name
  (delegation_specifiers (delegation_specifier (user_type) @implements)))
(object_declaration name: (identifier) @type.name
  (delegation_specifiers (delegation_specifier (constructor_invocation (user_type) @extends))))
(object_declaration name: (identifier) @type.name
  (delegation_specifiers (delegation_specifier (user_type) @implements)))

(call_expression (navigation_expression . (_) @call.receiver (identifier) @call.name .))
((call_expression . (identifier) @call.name) (#not-match? @call.name "^[A-Z]"))
((call_expression . (identifier) @new) (#match? @new "^[A-Z]"))

(class_parameter (identifier) @bind.name (user_type) @bind.type)
(parameter (identifier) @bind.name (user_type) @bind.type)
(property_declaration (variable_declaration (identifier) @bind.name (user_type) @bind.type))
(property_declaration (variable_declaration (identifier) @bind.name)
  (call_expression . (identifier) @bind.value))
