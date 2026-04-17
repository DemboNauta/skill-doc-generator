---
name: structlog-structured-logging
description: Modern, powerful structured logging for Python using structlog. Use when adding or improving logging in Python projects, configuring structlog for dev/production, working with contextvars for request-scoped logging, integrating structlog with stdlib logging, or writing tests for logging behavior.
categories:
  - Python
  - Logging
  - Observability
tags:
  - structlog
  - logging
  - structured-logging
  - json-logging
  - contextvars
  - python
  - observability
  - tracing
triggers:
  - User asks about structured logging in Python
  - User imports or uses structlog
  - User configures logging for a web app (Flask, FastAPI, Django)
  - User wants JSON logs for production
  - User needs request_id, user_id, or other context propagated through log calls
  - User writes tests that assert on log output
---

# structlog — Structured Logging for Python

structlog turns log entries into **dictionaries** processed through a **chain of functions**, giving you structured output (JSON, logfmt, pretty console) without sacrificing performance. It has been in production since 2013 and supports threads, asyncio, and greenlets.

## Why structlog over stdlib `logging`

| stdlib `logging` | structlog |
|---|---|
| String messages, hard to parse | Key-value dictionaries, machine-readable |
| Global mutable state | Immutable bound loggers, safe to pass around |
| Complex handler/formatter hierarchy | Simple processor chain of plain callables |
| No built-in context propagation | `contextvars` integration out of the box |
| Verbose boilerplate per file | One `get_logger()` call per file |

## Installation

```bash
pip install structlog
# For pretty dev exceptions (recommended):
pip install structlog rich
# Windows only (for colors):
pip install structlog rich colorama
```

## Core Concepts

### Event dict
Every log call builds a **dictionary** (`event_dict`). Context bound via `bind()` is merged with the kwargs of the log call.

### Processor chain
A list of callables, each with signature `(logger, method_name, event_dict) -> event_dict`. They run in order; the last one must return a string/bytes (the renderer).

### Bound logger
The object returned by `get_logger()`. It's **immutable** — calling `bind()` returns a new logger. Use `contextvars` for mutable global context.

---

## Basic Usage

```python
import structlog

log = structlog.get_logger()

# Simple log
log.info("user_login", user_id=42, ip="1.2.3.4")
# → 2024-01-01 12:00:00 [info     ] user_login   user_id=42 ip=1.2.3.4

# Bind context to a local logger
log = log.bind(request_id="abc-123", user_id=42)
log.info("processing_started")
log.warning("slow_query", duration_ms=1500)
# Both entries include request_id and user_id automatically

# Unbind a key
log = log.unbind("user_id")

# Replace all context
log = log.new(request_id="new-456")
```

### Log levels

```python
log.debug("debug_event")
log.info("info_event")
log.warning("warn_event")
log.error("error_event")
log.critical("critical_event")
# Exception with traceback:
try:
    1 / 0
except ZeroDivisionError:
    log.exception("division_failed")  # captures exc_info automatically
```

### asyncio

```python
import asyncio
import structlog

logger = structlog.get_logger()

async def handle_request():
    await logger.ainfo("async_request", path="/api/items")
    # sync methods also work inside async code:
    logger.info("sync_log_in_async")
```

---

## Configuration

Call `structlog.configure()` **once** at app startup, before any loggers are created.

```python
import structlog

structlog.configure(
    processors=[...],          # list of processor callables
    wrapper_class=...,         # bound logger class (default: FilteringBoundLogger)
    context_class=dict,        # context storage class
    logger_factory=...,        # factory for the underlying output logger
    cache_logger_on_first_use=True,  # freeze config for performance (disable in tests)
)
```

> **Important:** `get_logger()` returns a **lazy proxy** — safe to call at module level before `configure()`. Never call `bind()` or `new()` at module/class scope, as that freezes the default config. Use `get_logger(initial_key=value)` for pre-populated contexts instead.

---

## Recommended Configurations

### Development (pretty console output)

```python
import logging
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
        structlog.dev.ConsoleRenderer(),  # colorful, human-readable
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=False,  # keep False during development
)
```

### Production (JSON output, stdlib integration)

```python
import logging
import sys
import structlog

# Configure stdlib logging first
logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=logging.INFO,
)

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,          # drop below-threshold entries early
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),        # final renderer → JSON string
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
```

### Dev/Prod auto-switch (single config)

```python
import sys
import structlog

shared_processors = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
]

if sys.stderr.isatty():
    # Terminal session → pretty output
    processors = shared_processors + [structlog.dev.ConsoleRenderer()]
else:
    # Docker / CI / production → JSON with structured tracebacks
    processors = shared_processors + [
        structlog.processors.dict_tracebacks,
        structlog.processors.JSONRenderer(),
    ]

structlog.configure(processors=processors)
```

---

## Context Variables (Request-scoped Logging)

Use `contextvars` to bind values like `request_id` once per request and have them appear in **all** log entries — even those in deeply nested functions.

### Setup

```python
# Must be first in the processor chain:
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,  # ← first!
        ...
    ]
)
```

### Usage pattern

```python
from structlog.contextvars import (
    bind_contextvars,
    unbind_contextvars,
    clear_contextvars,
    bound_contextvars,  # context manager
)

# In your request middleware / handler entry point:
def process_request(request):
    clear_contextvars()                         # reset from previous request!
    bind_contextvars(
        request_id=str(uuid.uuid4()),
        user_id=request.user.id,
        path=request.path,
    )
    # All log calls anywhere in this thread/coroutine will include these values
    handle(request)

# Temporarily bind extra context:
with bound_contextvars(operation="checkout"):
    log.info("starting_operation")
    do_checkout()
    log.info("operation_complete")
# operation key is gone here
```

### Flask example

```python
import uuid
import flask
import structlog

logger = structlog.get_logger()
app = flask.Flask(__name__)

@app.before_request
def bind_request_context():
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=str(uuid.uuid4()),
        peer=flask.request.access_route[0],
        path=flask.request.path,
    )
```

> **FastAPI/Starlette warning:** Context variables are isolated between sync and async execution contexts. Values bound in sync middleware won't appear in async route logs and vice versa. Use a dedicated async middleware that calls `bind_contextvars` inside the async context.

### Passing context to worker threads

```python
from functools import partial
from structlog.contextvars import get_contextvars, bind_contextvars

def worker(ctx, item):
    bind_contextvars(**ctx)        # re-bind in the worker thread
    logger.info("processing_item", item=item)

ctx = get_contextvars()            # snapshot from the parent thread
with ThreadPoolExecutor() as pool:
    pool.map(partial(worker, ctx), items)
```

---

## Processors Reference

A processor is any callable with signature:

```python
def my_processor(logger, method_name: str, event_dict: dict) -> dict:
    event_dict["my_key"] = compute_value()
    return event_dict
```

### Built-in processors (most useful)

| Processor | Purpose |
|---|---|
| `merge_contextvars` | Merges contextvars into event dict (use first) |
| `add_log_level` | Adds `level` key |
| `TimeStamper(fmt="iso")` | Adds `timestamp` in ISO 8601 |
| `StackInfoRenderer()` | Renders `stack_info` key if present |
| `format_exc_info` | Renders exception under `exception` key |
| `dict_tracebacks` | Structured (dict) exception tracebacks |
| `UnicodeDecoder()` | Decodes bytes values to str |
| `CallsiteParameterAdder([...])` | Adds filename, func_name, lineno |
| `EventRenamer("msg")` | Renames the `event` key |
| `JSONRenderer()` | Renders event dict to JSON string |
| `ConsoleRenderer()` | Pretty colorful console output |
| `KeyValueRenderer()` | Simple `key=value` output |
| `DropEvent` | Raise this exception to silently drop an entry |

### Custom processor example

```python
def add_app_version(logger, method_name, event_dict):
    event_dict["app_version"] = "1.4.2"
    return event_dict

def drop_health_checks(logger, method_name, event_dict):
    if event_dict.get("path") == "/health":
        raise structlog.DropEvent
    return event_dict
```

### Log-level filtering

```python
import logging

# Only log WARNING and above:
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
)
```

---

## Integration with stdlib `logging`

### Quickest start

```python
import structlog
structlog.stdlib.recreate_defaults()
# structlog now routes through stdlib logging with sensible defaults
```

### Full integration (ProcessorFormatter)

Routes **both** structlog and stdlib `logging` through the same processor chain — consistent output for your code and third-party libraries:

```python
import logging
import structlog

timestamper = structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S")
shared_processors = [
    structlog.stdlib.add_log_level,
    structlog.stdlib.ExtraAdder(),   # pass `extra=` kwargs through
    timestamper,
]

structlog.configure(
    processors=shared_processors + [
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=shared_processors,   # applied to stdlib-only entries
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.dev.ConsoleRenderer(),   # or JSONRenderer() for production
    ],
)

handler = logging.StreamHandler()
handler.setFormatter(formatter)
root_logger = logging.getLogger()
root_logger.addHandler(handler)
root_logger.setLevel(logging.INFO)
```

> **Note:** When using `ProcessorFormatter`, do **not** use `render_to_log_kwargs()` in the processor chain — use `wrap_for_formatter` instead.

> **Note:** If using the same output stream for both structlog and stdlib, use `WriteLogger` (not `PrintLogger`) to prevent interleaved output. `PrintLogger` calls `print()` which writes message and newline separately.

---

## Testing

```python
from structlog.testing import capture_logs
import structlog

def test_login_logs_user_id():
    with capture_logs() as cap:
        structlog.get_logger().bind(user_id=99).info("user_login")

    assert cap == [{"user_id": 99, "event": "user_login", "log_level": "info"}]
```

### Capture with specific processors (e.g., contextvars)

```python
from structlog import contextvars, get_logger
from structlog.testing import capture_logs

def test_contextvars_appear():
    with capture_logs(processors=[contextvars.merge_contextvars]) as cap:
        contextvars.bind_contextvars(request_id="xyz")
        get_logger().info("hello")

    assert cap[0]["request_id"] == "xyz"
```

### pytest fixture

```python
import pytest
import structlog
from structlog.testing import LogCapture

@pytest.fixture(name="log_output")
def fixture_log_output():
    return LogCapture()

@pytest.fixture(autouse=True)
def fixture_configure_structlog(log_output):
    structlog.configure(processors=[log_output])
    yield
    structlog.reset_defaults()

def test_something(log_output):
    do_something()
    assert log_output.entries[0]["event"] == "expected_event"
```

> **Important:** Disable `cache_logger_on_first_use=True` in test configuration — cached loggers won't be affected by `capture_logs()`.

---

## Best Practices

### Canonical log lines
Bind context incrementally throughout a request and emit **one final summary log entry**. Less noise, more signal.

```python
log = structlog.get_logger()

def handle_order(order_id):
    log = log.bind(order_id=order_id)
    # ... process ...
    log.info("order_processed", items=5, total_usd=99.99, duration_ms=42)
```

### Use events as identifiers, not messages
```python
# Bad — hard to query in log aggregators:
log.info("User 42 logged in from 1.2.3.4")

# Good — machine-readable, queryable:
log.info("user_login", user_id=42, ip="1.2.3.4")
```

### Log to stdout, let infrastructure handle the rest
structlog → stdout → systemd/Docker/Kubernetes → log aggregator (ELK, Graylog, Datadog).

### Performance tip
In hot paths, create a local bound logger to avoid per-call proxy overhead:

```python
def process_batch(items):
    log = structlog.get_logger().bind(batch_size=len(items))  # one proxy resolution
    for item in items:
        log.debug("processing_item", item_id=item.id)
```

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Calling `bind()`/`new()` at module scope | Use `get_logger(key=value)` for initial values instead |
| Forgetting `clear_contextvars()` at request start | Old request's context leaks into new requests |
| `cache_logger_on_first_use=True` in tests | `capture_logs()` won't work; disable it in test setup |
| Using `PrintLogger` alongside `logging.StreamHandler` on same stream | Use `WriteLogger` to avoid interleaved output |
| Not calling `structlog.configure()` before first log | Logs with default config (may not match your expected format) |
| Hybrid sync/async with FastAPI/Starlette | Contextvars don't cross sync↔async boundaries automatically |
| Putting `merge_contextvars` anywhere but first | Context vars won't appear in output |

---

## Advanced Examples

### Rename `event` key to `message` for ECS/Datadog compatibility

```python
from structlog.processors import EventRenamer

structlog.configure(
    processors=[
        ...
        EventRenamer("message"),   # renames event → message in output
        structlog.processors.JSONRenderer(),
    ]
)
```

### Fine-grained per-module filtering

```python
def filter_noisy_module(logger, method_name, event_dict):
    if event_dict.get("func_name") in {"health_check", "ping"}:
        raise structlog.DropEvent
    return event_dict

structlog.configure(
    processors=[
        structlog.processors.CallsiteParameterAdder(
            [structlog.processors.CallsiteParameter.FUNC_NAME]
        ),
        filter_noisy_module,
        ...
    ]
)
```

### Output to stderr

```python
import sys
structlog.configure(logger_factory=structlog.PrintLoggerFactory(sys.stderr))
```

### Custom bound logger with domain-specific methods

```python
from structlog import BoundLoggerBase, PrintLogger, wrap_logger

class AppLogger(BoundLoggerBase):
    def user_action(self, action: str, **kw):
        return self._proxy_to_logger("info", action, status="ok", **kw)

    def user_error(self, action: str, **kw):
        return self._proxy_to_logger("warning", action, status="error", **kw)

log = wrap_logger(PrintLogger(), wrapper_class=AppLogger)
log.user_action("checkout", cart_size=3)
```

### Reset context for `contextvars.Token`

```python
from structlog.contextvars import bind_contextvars, reset_contextvars

def handler():
    bind_contextvars(user="alice")
    _helper()
    log.info("back to alice")   # user=alice

def _helper():
    tokens = bind_contextvars(user="bob")
    log.info("inside helper")   # user=bob
    reset_contextvars(**tokens)  # restore previous values
```

---

## Quick Reference

```python
import structlog

# Module-level logger (safe at import time)
logger = structlog.get_logger()

# Per-request context (in middleware)
structlog.contextvars.clear_contextvars()
structlog.contextvars.bind_contextvars(request_id="...", user_id=1)

# Local immutable context
log = logger.bind(component="payments")
log = log.bind(order_id=42)       # new logger, old unchanged
log = log.unbind("order_id")
log = log.new(session_id="fresh") # replace all context

# Log calls
log.debug / .info / .warning / .error / .critical("event_name", key=value)
log.exception("event_name")       # includes exc_info

# Async
await log.ainfo("async_event")

# Reset config (useful in tests)
structlog.reset_defaults()
```
