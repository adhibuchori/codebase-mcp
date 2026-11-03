; Call graph for Swift (our own query). Types of one module see each other without imports, so
; names resolve by type (the "types" style). A capitalised call constructs a type.

(class_declaration name: [(type_identifier) (user_type (type_identifier))] @type.name
  (inheritance_specifier inherits_from: (user_type) @implements))
(protocol_declaration name: (type_identifier) @type.name
  (inheritance_specifier inherits_from: (user_type) @extends))

(call_expression (navigation_expression target: (_) @call.receiver suffix: (navigation_suffix suffix: (simple_identifier) @call.name)))
((call_expression . (simple_identifier) @call.name) (#not-match? @call.name "^[A-Z]"))
((call_expression . (simple_identifier) @new) (#match? @new "^[A-Z]"))

(property_declaration name: (pattern bound_identifier: (simple_identifier) @bind.name) (type_annotation [(user_type) (optional_type) (opaque_type)] @bind.type))
(property_declaration name: (pattern bound_identifier: (simple_identifier) @bind.name)
  value: (call_expression . (simple_identifier) @bind.value))
(parameter (simple_identifier) @bind.name (user_type) @bind.type)
