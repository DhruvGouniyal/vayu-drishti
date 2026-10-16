"""Shared fixtures: isolated data dir per test and a fake network layer."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from vayu import http
from vayu.http import FetchError

Body = str | Exception | Callable[[dict], str]


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("VAYU_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FIRMS_MAP_KEY", "testkey0123456789abcdef0123456789")
    monkeypatch.setenv("OPENAQ_API_KEY", "test-openaq-key")
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "test-datagov-key")
    monkeypatch.delenv("OPENAQ_LOCATION_IDS", raising=False)
    return tmp_path / "data"


class FakeHttp:
    """Maps URL substrings to canned bodies; records every call."""

    def __init__(self) -> None:
        self.routes: dict[str, Body] = {}
        self.calls: list[tuple[str, dict | None]] = []

    def __call__(self, url: str, params: dict | None, headers: dict | None, timeout: float) -> str:
        self.calls.append((url, params))
        for fragment, body in self.routes.items():
            if fragment in url:
                if isinstance(body, Exception):
                    raise body
                return body(params or {}) if callable(body) else body
        raise FetchError(f"no fake route for {url}")


@pytest.fixture
def fake_http(monkeypatch) -> FakeHttp:
    fake = FakeHttp()
    monkeypatch.setattr(http, "_download", fake)
    monkeypatch.setattr(http, "_throttle", lambda *args: None)
    return fake
