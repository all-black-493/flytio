"""Vercel entrypoint.

Vercel detects a Python app from a top-level `app` in one of a fixed set of
filenames at the build root - `main.py` among them - and routes every request
to it. The real application is `backend/main.py`; this cannot simply be that
file, because every import in the tree is rooted at the repository root
(`from backend.config import settings`), so the build root has to be the
repository root and the entrypoint has to sit in it.

`[tool.vercel] entrypoint` in a root pyproject.toml is the documented way to
name a module instead, and it is not honoured by the builder as of CLI 64.7.0 -
the build fails looking for functions in an `api/` directory. Hence the
re-export.
"""

from backend.main import app

__all__ = ["app"]
