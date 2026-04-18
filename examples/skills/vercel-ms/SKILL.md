---
name: vercel-ms
description: Use when working with the `ms` package (vercel/ms) for converting between millisecond numbers and human-readable time strings. Trigger when the user imports `ms`, writes timeout/delay/duration values, needs to parse strings like '2 days' or '1h' to milliseconds, or format a number of milliseconds into a readable string.
---

# vercel/ms — Millisecond Conversion Utility

Tiny utility (zero deps) that converts between millisecond numbers and human-readable time strings.

## Install

```bash
npm install ms
```

## Core API

```ts
import { ms, parse, format, parseStrict } from 'ms';
```

### `ms(string)` → number
Parse a time string into milliseconds:

```ts
ms('2 days')   // 172800000
ms('1d')       // 86400000
ms('10h')      // 36000000
ms('2.5 hrs')  // 9000000
ms('1m')       // 60000
ms('5s')       // 5000
ms('1y')       // 31557600000
ms('-3 days')  // -259200000
ms('100')      // 100  (no unit → treated as ms)
```

### `ms(number)` → string
Format milliseconds into a short string:

```ts
ms(60000)           // "1m"
ms(2 * 60000)       // "2m"
ms(-3 * 60000)      // "-3m"
ms(ms('10 hours'))  // "10h"
```

### `ms(number, { long: true })` → string
Format milliseconds into a verbose string:

```ts
ms(60000, { long: true })          // "1 minute"
ms(2 * 60000, { long: true })      // "2 minutes"
ms(ms('10 hours'), { long: true }) // "10 hours"
```

### `parse(str)` / `format(ms, options?)`
Import separately when you only need one direction:

```ts
import { parse, format } from 'ms';

parse('1h')  // 3600000
format(2000) // "2s"
format(2000, { long: true }) // "2 seconds"
```

### `parseStrict(value: StringValue)`
Like `parse`, but enforces TypeScript's `StringValue` type — rejects arbitrary strings at compile time:

```ts
import { parseStrict } from 'ms';

parseStrict('1h') // 3600000

function foo(s: string) {
  return parseStrict(s) // tsc error — s is not StringValue
}
```

## Supported Units

| Unit | Accepted strings |
|------|-----------------|
| Years | `years` `year` `yrs` `yr` `y` |
| Months | `months` `month` `mo` |
| Weeks | `weeks` `week` `w` |
| Days | `days` `day` `d` |
| Hours | `hours` `hour` `hrs` `hr` `h` |
| Minutes | `minutes` `minute` `mins` `min` `m` |
| Seconds | `seconds` `second` `secs` `sec` `s` |
| Milliseconds | `milliseconds` `millisecond` `msecs` `msec` `ms` |

Units are case-insensitive (`MINUTES`, `Minutes`, `minutes`) and accept optional space (`2 hours` or `2hours`). Fractional values (`0.5m`, `-1.5h`) are supported.

## TypeScript — `StringValue` type

Import `StringValue` when you need to type a parameter that `ms()` will consume:

```ts
import { ms, type StringValue } from 'ms';

function withTimeout(duration: StringValue) {
  setTimeout(callback, ms(duration));
}

withTimeout('500ms');
withTimeout('2 minutes');
```

For custom constraints use template literal types:

```ts
type OnlyDaysOrWeeks = `${number} ${'days' | 'weeks'}`;

function foo(v: OnlyDaysOrWeeks) {
  ms(v); // safe — narrower than StringValue
}
```

## Common patterns

```ts
// Timeouts and intervals
setTimeout(fn, ms('30s'));
setInterval(fn, ms('5m'));

// Expiry calculations
const expiresAt = Date.now() + ms('7d');

// Human-readable elapsed time
const elapsed = Date.now() - startedAt;
console.log(`Running for ${ms(elapsed, { long: true })}`);

// Cache TTL
const TTL = ms('1h'); // 3600000
```
