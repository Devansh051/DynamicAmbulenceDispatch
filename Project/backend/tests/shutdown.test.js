import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import { registerShutdown } from '../src/utils/shutdown.js';

afterEach(() => jest.useRealTimers());

test('shutdown is idempotent, ordered, and removes signal listeners', async () => {
  const signals = new EventEmitter();
  const exit = jest.fn();
  const order = [];
  const shutdown = registerShutdown([
    ['intake', async () => order.push('intake')],
    ['persistence', async () => order.push('persistence')],
    ['connections', async () => order.push('connections')]
  ], { signals, exit });
  const first = shutdown('SIGINT');
  expect(shutdown('SIGTERM')).toBe(first);
  await first;
  expect(order).toEqual(['intake', 'persistence', 'connections']);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(0);
  expect(signals.listenerCount('SIGINT')).toBe(0);
});

test('cleanup failure still closes remaining resources and exits unsuccessfully', async () => {
  const exit = jest.fn();
  const close = jest.fn();
  const shutdown = registerShutdown([
    ['worker', async () => { throw new Error('unavailable'); }],
    ['connections', close]
  ], { signals: new EventEmitter(), exit });
  await shutdown('SIGTERM');
  expect(close).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(1);
});

test('deadline starts before a stalled cleanup task', async () => {
  jest.useFakeTimers();
  let finish;
  const exit = jest.fn();
  const shutdown = registerShutdown([['stalled', () => new Promise((resolve) => { finish = resolve; })]],
    { signals: new EventEmitter(), exit, timeoutMs: 100 });
  const pending = shutdown('SIGTERM');
  await Promise.resolve();
  jest.advanceTimersByTime(100);
  expect(exit).toHaveBeenCalledWith(1);
  finish();
  await pending;
});
