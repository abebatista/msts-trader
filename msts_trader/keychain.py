"""OS-keychain credential storage, keyed by broker name.

Stores `creds:<broker>` JSON blobs plus a `default_broker` pointer.
Adding a new broker = add login flow in __main__.py; this module
already supports arbitrary keys.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import keyring
import keyring.errors

SERVICE = "msts-trader"
DEFAULT_KEY = "default_broker"
SECRET_PREFIX = "secret:"


class CredsMissingError(RuntimeError):
    pass


def _fallback_path() -> Path:
    custom = os.environ.get("MSTS_KEYCHAIN_FILE", "").strip()
    if custom:
        return Path(os.path.expanduser(custom))
    return Path(os.path.expanduser("~/.msts-trader/keychain.json"))


def _read_fallback_store() -> dict[str, str]:
    p = _fallback_path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_fallback_store(store: dict[str, str]) -> None:
    p = _fallback_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(p)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass


def _set_raw(key: str, value: str) -> None:
    if os.environ.get("MSTS_KEYCHAIN_FILE", "").strip():
        store = _read_fallback_store()
        store[key] = value
        _write_fallback_store(store)
        return
    try:
        keyring.set_password(SERVICE, key, value)
    except keyring.errors.KeyringError:
        store = _read_fallback_store()
        store[key] = value
        _write_fallback_store(store)


def _get_raw(key: str) -> str | None:
    if os.environ.get("MSTS_KEYCHAIN_FILE", "").strip():
        return _read_fallback_store().get(key)
    try:
        val = keyring.get_password(SERVICE, key)
        if val is not None:
            return val
    except keyring.errors.KeyringError:
        return _read_fallback_store().get(key)
    return None


def _delete_raw(key: str) -> None:
    if os.environ.get("MSTS_KEYCHAIN_FILE", "").strip():
        store = _read_fallback_store()
        if key in store:
            del store[key]
            _write_fallback_store(store)
        return
    try:
        keyring.delete_password(SERVICE, key)
    except keyring.errors.PasswordDeleteError:
        pass
    except keyring.errors.KeyringError:
        store = _read_fallback_store()
        if key in store:
            del store[key]
            _write_fallback_store(store)


def save(broker: str, payload: dict) -> None:
    _set_raw(f"creds:{broker}", json.dumps(payload))


def load(broker: str) -> dict:
    raw = _get_raw(f"creds:{broker}")
    if not raw:
        raise CredsMissingError(
            f"no stored creds for broker {broker!r} — run `msts-trader login --broker {broker}` first"
        )
    return json.loads(raw)


def clear(broker: str) -> None:
    _delete_raw(f"creds:{broker}")


def save_secret(name: str, value: str) -> None:
    _set_raw(f"{SECRET_PREFIX}{name}", value)


def load_secret(name: str) -> str | None:
    return _get_raw(f"{SECRET_PREFIX}{name}")


def clear_secret(name: str) -> None:
    _delete_raw(f"{SECRET_PREFIX}{name}")


def set_default(broker: str) -> None:
    _set_raw(DEFAULT_KEY, broker)


def get_default() -> str | None:
    return _get_raw(DEFAULT_KEY)


def clear_default() -> None:
    _delete_raw(DEFAULT_KEY)


def list_brokers() -> list[str]:
    """Best-effort list of brokers with creds in this keychain.

    Some keyring backends don't expose enumeration; fall back to probing
    the known supported names.
    """
    from .brokers import SUPPORTED

    out: list[str] = []
    for name in SUPPORTED:
        try:
            if _get_raw(f"creds:{name}"):
                out.append(name)
        except Exception:
            continue
    return out
