import pytest

from vayu.http import FetchError, fetch_cached, redact


def test_prefer_cache_downloads_once(fake_http, tmp_path):
    fake_http.routes["example"] = "hello"
    cache = tmp_path / "a.txt"
    assert fetch_cached("https://example.org/x", cache, mode="prefer_cache") == "hello"
    assert fetch_cached("https://example.org/x", cache, mode="prefer_cache") == "hello"
    assert len(fake_http.calls) == 1


def test_refresh_falls_back_to_stale_cache(fake_http, tmp_path):
    cache = tmp_path / "live.txt"
    cache.write_text("yesterday", encoding="utf-8")
    fake_http.routes["example"] = FetchError("HTTP 503")
    assert fetch_cached("https://example.org/x", cache, mode="refresh") == "yesterday"


def test_offline_never_hits_network(fake_http, tmp_path):
    with pytest.raises(FetchError, match="offline"):
        fetch_cached("https://example.org/x", tmp_path / "missing.txt", mode="offline")
    assert fake_http.calls == []


def test_invalid_body_is_not_cached(fake_http, tmp_path):
    fake_http.routes["example"] = "Invalid MAP_KEY."
    cache = tmp_path / "bad.csv"

    def validate(text: str) -> None:
        if not text.startswith("latitude"):
            raise ValueError(text)

    with pytest.raises(FetchError, match="Invalid MAP_KEY"):
        fetch_cached("https://example.org/x", cache, mode="refresh", validate=validate)
    assert not cache.exists()


def test_redact_hides_firms_key():
    url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/abcdef0123456789abcdef0123456789/VIIRS_SNPP_NRT/1,2,3,4/1"
    assert "abcdef0123456789" not in redact(url)
