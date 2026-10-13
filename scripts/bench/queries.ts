/** The tool calls the scale benchmark times: one of each kind an agent makes while debugging. */
export interface BenchQuery {
  readonly label: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export const QUERIES: readonly BenchQuery[] = [
  { label: 'list_repos (all)', tool: 'list_repos', args: {} },
  {
    label: 'search_code rare literal',
    tool: 'search_code',
    args: { query: 'failed to place order' },
  },
  { label: 'search_code common literal', tool: 'search_code', args: { query: 'context' } },
  {
    label: 'search_code identifier (word)',
    tool: 'search_code',
    args: { query: 'PlaceOrder', mode: 'word' },
  },
  {
    label: 'search_code regex',
    tool: 'search_code',
    args: { query: 'func \\w+Handler', mode: 'regex' },
  },
  { label: 'find_symbol exact', tool: 'find_symbol', args: { name: 'PlaceOrder' } },
  { label: 'find_symbol substring', tool: 'find_symbol', args: { name: 'Checkout' } },
  { label: 'find_files', tool: 'find_files', args: { query: 'Dockerfile' } },
  { label: 'find_endpoint topic', tool: 'find_endpoint', args: { query: 'orders' } },
];
