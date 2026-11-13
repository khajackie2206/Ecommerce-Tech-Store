import { randomInt } from 'node:crypto';

// Order code shown to customers: "TS" + date (yyMMdd, Vietnam time) + 6 random characters,
// e.g. TS261108K3P9QZ. Random, not 0001, 0002...: a counter would need a query per order
// and would tell competitors how many orders the shop gets per day.
// UQ_Orders_code in the database is the safety net against the (tiny) chance of a repeat.
export function generateOrderCode(now = new Date()): string {
  const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const date = vietnamTime.toISOString().slice(2, 10).replaceAll('-', ''); // "261108"
  const random = randomInt(0, 36 ** 6) // 0 .. 2 176 782 335
    .toString(36) // base 36: digits + letters
    .toUpperCase()
    .padStart(6, '0');
  return `TS${date}${random}`;
}
