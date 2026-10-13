/**
 * The routes a REST resource declaration stands for. Rails (`resources :orders`) and Phoenix
 * (`resources "/orders", OrderController`) expand one line into the conventional actions, narrowed
 * by an `only:` or `except:` list; listing them lets a URL such as GET /orders/42 find that line.
 */
export interface ResourceRoute {
  readonly method: string;
  readonly path: string;
}

/** Action, HTTP method and path suffix, in the order both frameworks document them. */
const ACTIONS: readonly (readonly [string, string, string])[] = [
  ['index', 'GET', ''],
  ['new', 'GET', '/new'],
  ['create', 'POST', ''],
  ['show', 'GET', '/:id'],
  ['edit', 'GET', '/:id/edit'],
  ['update', 'PATCH', '/:id'],
  ['update', 'PUT', '/:id'],
  ['destroy', 'DELETE', '/:id'],
];
/** `only: [:index, :show]`, `except: %i[new edit]` or `only: :show`. */
const FILTER = /\b(only|except):\s*(?:%i\[([^\]]*)\]|\[([^\]]*)\]|:(\w+))/;

/** The routes of the resource at `base`, narrowed by the `only:`/`except:` option in `options`. */
export function resourceRoutes(base: string, options: string): ResourceRoute[] {
  const filter = FILTER.exec(options);
  const names: readonly string[] =
    (filter?.[2] ?? filter?.[3] ?? filter?.[4] ?? '').match(/\w+/g) ?? [];
  const kept = (action: string): boolean => {
    if (!filter) return true;
    return filter[1] === 'only' ? names.includes(action) : !names.includes(action);
  };
  return ACTIONS.filter(([action]) => kept(action)).map(([, method, suffix]) => ({
    method,
    path: `${base}${suffix}`,
  }));
}
