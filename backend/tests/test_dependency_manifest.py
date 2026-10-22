"""The root pyproject.toml is what Vercel installs from.

A pyproject.toml at the build root takes priority over every other dependency
source, so anything missing from it is missing at runtime and any range in it
is resolved fresh at deploy time rather than coming from the tested lockfile.
"""

import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

PIN = re.compile(r"^(?P<name>[A-Za-z0-9._-]+)(?:\[[^\]]*\])?==(?P<version>[^\s;]+)")


def _normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _deploy_pins() -> dict[str, str]:
    manifest = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text())
    pins = {}
    for spec in manifest["project"]["dependencies"]:
        match = PIN.match(spec)
        assert match, f"not an exact pin: {spec!r}"
        pins[_normalize(match["name"])] = match["version"]
    return pins


def _locked_versions() -> dict[str, str]:
    lock = (REPO_ROOT / "backend" / "uv.lock").read_text()
    return {
        _normalize(name.group(1)): version.group(1)
        for block in lock.split("[[package]]")[1:]
        if (name := re.search(r'^name = "(.+?)"', block, re.M))
        and (version := re.search(r'^version = "(.+?)"', block, re.M))
    }


def test_deployed_versions_come_from_the_backend_lockfile():
    locked = _locked_versions()
    mismatched = {
        name: (version, locked[name])
        for name, version in _deploy_pins().items()
        if name in locked and locked[name] != version
    }
    assert not mismatched, f"deploy pin -> lockfile: {mismatched}"


def test_every_deployed_package_is_in_the_lockfile():
    locked = _locked_versions()
    assert not sorted(set(_deploy_pins()) - set(locked))


def test_every_backend_dependency_is_deployed():
    backend = tomllib.loads((REPO_ROOT / "backend" / "pyproject.toml").read_text())
    declared = {
        _normalize(re.match(r"^[A-Za-z0-9._-]+", spec).group(0))
        for spec in backend["project"]["dependencies"]
    }
    assert not sorted(declared - set(_deploy_pins()))
