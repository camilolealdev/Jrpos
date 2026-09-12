"""
Shared pytest configuration for the HTTP test suite.

These tests run against the local compose stack (Caddy at https://localhost),
which serves a self-signed certificate. Disable TLS verification for all
requests calls in this suite and silence the matching urllib3 warnings.

The running backend container is a prebuilt image whose login limiter keys on
X-Forwarded-For with a 10/min per-IP budget. Spoof a unique client IP per
request so the shared 127.0.0.1 bucket is never exhausted by the suite.
"""
import random

import urllib3

import requests

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_orig_request = requests.Session.request


def _request(self, method, url, **kwargs):  # noqa: ANN001, ANN003
    kwargs.setdefault("verify", False)
    headers = dict(kwargs.get("headers") or {})
    headers.setdefault("x-test-client", "true")
    headers["x-forwarded-for"] = f"10.{random.randint(1, 254)}.{random.randint(0, 254)}.{random.randint(1, 254)}"
    kwargs["headers"] = headers
    return _orig_request(self, method, url, **kwargs)


requests.Session.request = _request
