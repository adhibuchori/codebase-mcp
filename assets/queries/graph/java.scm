; Call graph for Java (our own query). Captures: package, import.qualified, import.wildcard,
; type.name with extends or implements, call.name with an optional call.receiver, new, and
; bind.name with bind.type or bind.value. src/core/graph/file-graph.ts reads them.

(package_declaration [(scoped_identifier) (identifier)] @package)

(import_declaration [(scoped_identifier) (identifier)] @import.qualified .)
(import_declaration [(scoped_identifier) (identifier)] @import.wildcard (asterisk))

(class_declaration name: (identifier) @type.name
  superclass: (superclass [(type_identifier) (generic_type) (scoped_type_identifier)] @extends))
(class_declaration name: (identifier) @type.name
  interfaces: (super_interfaces (type_list [(type_identifier) (generic_type) (scoped_type_identifier)] @implements)))
(enum_declaration name: (identifier) @type.name
  interfaces: (super_interfaces (type_list [(type_identifier) (generic_type) (scoped_type_identifier)] @implements)))
(record_declaration name: (identifier) @type.name
  interfaces: (super_interfaces (type_list [(type_identifier) (generic_type) (scoped_type_identifier)] @implements)))
(interface_declaration name: (identifier) @type.name
  (extends_interfaces (type_list [(type_identifier) (generic_type) (scoped_type_identifier)] @extends)))

(method_invocation object: (_) @call.receiver name: (identifier) @call.name)
(method_invocation !object name: (identifier) @call.name)
(method_reference . (_) @call.receiver . (identifier) @call.name)
(object_creation_expression type: (_) @new)

(field_declaration type: (_) @bind.type declarator: (variable_declarator name: (identifier) @bind.name))
(local_variable_declaration type: (_) @bind.type
  declarator: (variable_declarator name: (identifier) @bind.name value: (object_creation_expression type: (_) @bind.value)))
(local_variable_declaration type: (_) @bind.type declarator: (variable_declarator name: (identifier) @bind.name))
(formal_parameter type: (_) @bind.type name: (identifier) @bind.name)
(enhanced_for_statement type: (_) @bind.type name: (identifier) @bind.name)
(catch_formal_parameter (catch_type (_) @bind.type) name: (identifier) @bind.name)
