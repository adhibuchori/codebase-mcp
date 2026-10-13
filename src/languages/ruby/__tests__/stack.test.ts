/** Ruby backtraces in uncaught and Rails log form, old and new quoting, and cause chains. */
import { describe, expect, test } from 'bun:test';
import { rubyStackParser } from '../stack.ts';

const frames = (text: string): string[] =>
  (rubyStackParser(text)?.frames ?? []).map(
    (frame) => `${frame.func} @ ${frame.pathHint}:${frame.line}`,
  );

describe('uncaught exceptions', () => {
  test('reads the Ruby 3.4 form, innermost first', () => {
    const trace = `app/models/order.rb:42:in 'Order#cancel!': order 42 was already shipped (Order::AlreadyShipped)
	from app/services/cancel_order.rb:12:in 'block in CancelOrder#call'
	from /usr/local/bundle/gems/activerecord-7.1.3/lib/active_record/transactions.rb:209:in 'transaction'
	from bin/cancel:5:in '<main>'`;
    expect(frames(trace)).toEqual([
      'Order#cancel! @ app/models/order.rb:42',
      'block in CancelOrder#call @ app/services/cancel_order.rb:12',
      'transaction @ /usr/local/bundle/gems/activerecord-7.1.3/lib/active_record/transactions.rb:209',
      '<main> @ bin/cancel:5',
    ]);
    expect(rubyStackParser(trace)).toMatchObject({
      runtime: 'ruby',
      messages: ['order 42 was already shipped (Order::AlreadyShipped)'],
    });
  });

  test('reads the backtick form of older Rubies', () => {
    expect(
      frames(
        "lib/billing.rb:7:in `charge': card declined (Billing::Declined)\n\tfrom lib/billing.rb:20:in `run'",
      ),
    ).toEqual(['charge @ lib/billing.rb:7', 'run @ lib/billing.rb:20']);
  });

  test('a cause printed after its exception puts the root cause frames first', () => {
    const chained = `app/services/sync.rb:15:in 'rescue in Sync#call': sync failed (Sync::Error)
	from app/services/sync.rb:10:in 'Sync#call'
app/clients/inventory.rb:8:in 'Inventory#fetch': connection refused (Errno::ECONNREFUSED)
	from app/services/sync.rb:11:in 'Sync#call'`;
    expect(rubyStackParser(chained)?.messages).toEqual([
      'sync failed (Sync::Error)',
      'connection refused (Errno::ECONNREFUSED)',
    ]);
    expect(frames(chained)).toEqual([
      'Inventory#fetch @ app/clients/inventory.rb:8',
      'Sync#call @ app/services/sync.rb:11',
      'rescue in Sync#call @ app/services/sync.rb:15',
      'Sync#call @ app/services/sync.rb:10',
    ]);
  });
});

describe('Rails logs', () => {
  test('reads the header and the bare backtrace lines after it', () => {
    const log = `Completed 404 Not Found in 12ms (ActiveRecord: 1.2ms)

ActiveRecord::RecordNotFound (Couldn't find Order with 'id'=42):

app/controllers/orders_controller.rb:58:in \`set_order'
app/controllers/concerns/auditing.rb:9:in \`audit'`;
    expect(rubyStackParser(log)?.messages).toEqual([
      "Couldn't find Order with 'id'=42 (ActiveRecord::RecordNotFound)",
    ]);
    expect(frames(log)).toEqual([
      'set_order @ app/controllers/orders_controller.rb:58',
      'audit @ app/controllers/concerns/auditing.rb:9',
    ]);
  });

  test('has no message when only frames were pasted', () => {
    expect(rubyStackParser("app/jobs/sync_job.rb:3:in 'perform'")?.messages).toEqual([]);
  });

  test('returns null without Ruby frames', () => {
    expect(rubyStackParser('Error: boom\n    at handler (/app/x.js:1:2)')).toBeNull();
    expect(rubyStackParser('NoMethodError (undefined method)')).toBeNull();
  });
});
