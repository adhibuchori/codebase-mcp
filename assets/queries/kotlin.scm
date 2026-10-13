; Tags query for Kotlin, written for @tree-sitter-grammars/tree-sitter-kotlin 1.1.0, which ships
; no tags.scm. Classes, interfaces, enum and data classes are all class_declaration in this grammar.

(class_declaration
  name: (identifier) @name) @definition.class

(object_declaration
  name: (identifier) @name) @definition.class

(function_declaration
  name: (identifier) @name) @definition.function

(type_alias
  type: (identifier) @name) @definition.type
