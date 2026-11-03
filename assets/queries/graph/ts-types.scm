; Call graph, TypeScript and TSX: extends and implements, and the declared types of fields,
; parameters and variables.

(class_declaration name: (_) @type.name (class_heritage (implements_clause [(type_identifier) (generic_type) (nested_type_identifier)] @implements)))
(interface_declaration name: (_) @type.name (extends_type_clause [(type_identifier) (generic_type) (nested_type_identifier)] @extends))

(public_field_definition name: (property_identifier) @bind.name type: (type_annotation (_) @bind.type))
(required_parameter pattern: (identifier) @bind.name type: (type_annotation (_) @bind.type))
(optional_parameter pattern: (identifier) @bind.name type: (type_annotation (_) @bind.type))
(variable_declarator name: (identifier) @bind.name type: (type_annotation (_) @bind.type))

(class_declaration name: (_) @type.name (class_heritage (extends_clause value: (_) @extends)))
(abstract_class_declaration name: (_) @type.name (class_heritage (extends_clause value: (_) @extends)))
(abstract_class_declaration name: (_) @type.name (class_heritage (implements_clause [(type_identifier) (generic_type) (nested_type_identifier)] @implements)))
