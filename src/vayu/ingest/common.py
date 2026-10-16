"""Helper shared by the fetchers: keep partial results, fail only when nothing worked."""

from __future__ import annotations

import logging

import pandas as pd

from vayu.http import FetchError

log = logging.getLogger(__name__)


def combine_partial(frames: list[pd.DataFrame], errors: list[str], total: int, label: str) -> pd.DataFrame:
    """Concatenate successful chunks; raise only if every one of `total` requests failed."""
    if total == 0:
        raise FetchError(f"{label}: nothing to fetch")
    if not frames:
        first = f"; first error: {errors[0]}" if errors else ""
        raise FetchError(f"{label}: all {total} requests failed{first}")
    if errors:
        log.warning("%s: %d of %d requests failed, data is partial", label, len(errors), total)
    non_empty = [f for f in frames if not f.empty]
    return pd.concat(non_empty, ignore_index=True) if non_empty else frames[0]
