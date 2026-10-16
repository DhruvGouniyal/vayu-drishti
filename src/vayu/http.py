"""HTTP GET with retries, polite throttling and an on-disk response cache.

Cache modes:
  prefer_cache  use the cached file if present, else download (history never changes)
  refresh       always download; if that fails, fall back to the last cached copy (live data)
  offline       never touch the network; cached copy or FetchError
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)

CacheMode = Literal["prefer_cache", "refresh", "offline"]


class FetchError(RuntimeError):
    """A request failed and no usable cached copy exists."""


_session: requests.Session | None = None
_last_call: dict[str, float] = {}


def get_session() -> requests.Session:
    """Shared session that retries 429/5xx with exponential backoff and honours Retry-After."""
    global _session
    if _session is None:
        retry = Retry(
            total=5,
            backoff_factor=2,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}),
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        _session = requests.Session()
        _session.mount("https://", HTTPAdapter(max_retries=retry))
        _session.headers["User-Agent"] = "vayu-drishti/0.1 (hackathon research)"
    return _session


def redact(text: str) -> str:
    """Hide API keys that appear in URLs or messages."""
    text = re.sub(r"(/(?:csv|ALL)/)[A-Za-z0-9]{20,}", r"\1***", text)
    return re.sub(r"(?i)(map_key=|api[-_]key=)[^&\s]+", r"\1***", text)


def _throttle(key: str, min_interval: float) -> None:
    wait = _last_call.get(key, 0.0) + min_interval - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call[key] = time.monotonic()


def _download(url: str, params: dict | None, headers: dict | None, timeout: float) -> str:
    resp = get_session().get(url, params=params, headers=headers, timeout=timeout)
    if resp.status_code >= 400:
        raise FetchError(f"HTTP {resp.status_code} from {redact(resp.url)}: {resp.text[:200]}")
    return resp.text


def fetch_cached(
    url: str,
    cache_path: Path,
    *,
    mode: CacheMode,
    params: dict | None = None,
    headers: dict | None = None,
    validate: Callable[[str], None] | None = None,
    throttle_key: str | None = None,
    min_interval: float = 0.0,
    timeout: float = 90.0,
) -> str:
    """Return the response body for `url`, using `cache_path` according to `mode`.

    `validate` should raise ValueError for bodies that are errors in disguise
    (e.g. HTTP 200 with "Invalid MAP_KEY"); those are never cached.
    """
    if mode == "offline":
        if cache_path.exists():
            return cache_path.read_text(encoding="utf-8")
        raise FetchError(f"offline mode and no cached copy at {cache_path.name}")

    if mode == "prefer_cache" and cache_path.exists():
        return cache_path.read_text(encoding="utf-8")

    try:
        if throttle_key:
            _throttle(throttle_key, min_interval)
        text = _download(url, params, headers, timeout)
        if validate:
            validate(text)
    except (requests.RequestException, FetchError, ValueError) as exc:
        if cache_path.exists():
            log.warning("Fetch failed (%s); using cached copy %s", redact(str(exc)), cache_path.name)
            return cache_path.read_text(encoding="utf-8")
        raise FetchError(redact(str(exc))) from exc

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_name(cache_path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(cache_path)
    return text
