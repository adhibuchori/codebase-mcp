; Call graph, JSX (javascript and tsx grammars): `<Button />` renders the Button component.

(jsx_opening_element name: (identifier) @render)
(jsx_opening_element name: (member_expression object: (_) @call.receiver property: (property_identifier) @render))
(jsx_self_closing_element name: (identifier) @render)
(jsx_self_closing_element name: (member_expression object: (_) @call.receiver property: (property_identifier) @render))
