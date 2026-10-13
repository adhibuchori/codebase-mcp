/** PHP traces: native uncaught output with Next chains, and Laravel's logged [previous exception] chains. */
import { describe, expect, test } from 'bun:test';
import { phpStackParser } from '../stack.ts';

const frames = (text: string): string[] =>
  (phpStackParser(text)?.frames ?? []).map(
    (frame) => `${frame.func} @ ${frame.pathHint}:${frame.line}`,
  );

describe('native traces', () => {
  const uncaught = `[13-May-2024 10:00:00 UTC] PHP Fatal error:  Uncaught App\\Exceptions\\OrderNotFound: Order 42 not found in /var/www/app/src/Service/OrderService.php:88
Stack trace:
#0 /var/www/app/src/Controller/OrderController.php(41): App\\Service\\OrderService->cancel(42, Object(App\\Dto\\CancelRequest))
#1 [internal function]: App\\Controller\\OrderController->cancel(42)
#2 /var/www/app/vendor/symfony/http-kernel/HttpKernel.php(181): call_user_func_array(Array, Array)
#3 {main}
  thrown in /var/www/app/src/Service/OrderService.php on line 88`;

  test('adds the throw site as the innermost frame, then the # frames', () => {
    expect(frames(uncaught)).toEqual([
      ' @ /var/www/app/src/Service/OrderService.php:88',
      'App\\Service\\OrderService->cancel @ /var/www/app/src/Controller/OrderController.php:41',
      'App\\Controller\\OrderController->cancel @ :0',
      'call_user_func_array @ /var/www/app/vendor/symfony/http-kernel/HttpKernel.php:181',
    ]);
    expect(phpStackParser(uncaught)).toMatchObject({
      runtime: 'php',
      messages: ['App\\Exceptions\\OrderNotFound: Order 42 not found'],
    });
  });

  test('a Next chain lists the wrapper first and its root cause frames first', () => {
    const chained = `PHP Fatal error:  Uncaught PDOException: SQLSTATE[HY000] [2002] Connection refused in /var/www/app/src/Db.php:12
Stack trace:
#0 /var/www/app/src/Repo.php(30): App\\Db->connect()
#1 {main}

Next App\\Exceptions\\RepositoryError: database unavailable in /var/www/app/src/Repo.php:34
Stack trace:
#0 /var/www/app/public/index.php(9): App\\Repo->find(42)
#1 {main}
  thrown in /var/www/app/src/Repo.php on line 34`;
    expect(phpStackParser(chained)?.messages).toEqual([
      'App\\Exceptions\\RepositoryError: database unavailable',
      'PDOException: SQLSTATE[HY000] [2002] Connection refused',
    ]);
    expect(frames(chained)).toEqual([
      ' @ /var/www/app/src/Db.php:12',
      'App\\Db->connect @ /var/www/app/src/Repo.php:30',
      ' @ /var/www/app/src/Repo.php:34',
      'App\\Repo->find @ /var/www/app/public/index.php:9',
    ]);
  });

  test('reads a fatal error reported on a line', () => {
    const fatal =
      'PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted in /var/www/app/src/Export.php on line 77';
    expect(frames(fatal)).toEqual([' @ /var/www/app/src/Export.php:77']);
  });
});

describe('logged traces', () => {
  test('reads a Laravel log entry with a previous exception', () => {
    const logged = `[2024-05-01 10:00:00] production.ERROR: Order not found {"exception":"[object] (App\\\\Exceptions\\\\OrderNotFound(code: 0): Order not found at /var/www/app/app/Services/OrderService.php:42)
[stacktrace]
#0 /var/www/app/app/Http/Controllers/OrderController.php(17): App\\\\Services\\\\OrderService->cancel(123)
#1 {main}

[previous exception] [object] (PDOException(code: 2002): Connection refused at /var/www/app/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:65)
[stacktrace]
#0 /var/www/app/app/Services/OrderService.php(40): Illuminate\\\\Database\\\\Connection->select('select * from o...')
#1 {main}
"}`;
    expect(phpStackParser(logged)?.messages).toEqual([
      'App\\\\Exceptions\\\\OrderNotFound: Order not found',
      'PDOException: Connection refused',
    ]);
    expect(frames(logged)[0]).toBe(
      ' @ /var/www/app/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:65',
    );
    expect(frames(logged)).toHaveLength(4);
  });

  test('reads a trace escaped inside a JSON log line, and bare frames', () => {
    const json = String.raw`{"trace":"#0 /var/www/app/src/Job.php(12): App\\Job->run()\n#1 {main}"}`;
    expect(frames(json)).toEqual(['App\\Job->run @ /var/www/app/src/Job.php:12']);
    expect(phpStackParser('#0 /app/index.php(3): main()')?.messages).toEqual([]);
  });

  test('returns null without PHP frames', () => {
    expect(phpStackParser('Error: boom\n    at handler (/app/x.js:1:2)')).toBeNull();
  });
});
