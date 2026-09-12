"""
Shared pytest configuration for the HTTP test suite.

These tests run against the local compose stack (Caddy at https://localhost),
which serves a self-signed certificate. Disable TLS verification for all
requests calls in this suite and silence the matching urllib3 warnings.
"""
import urllib3

import requests

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_orig_request = requests.Session.request


def _request(self, method, url, **kwargs):  # noqa: ANN001, ANN003
    kwargs.setdefault("verify", False)
    headers = dict(kwargs.get("headers") or {})
    headers.setdefault("x-test-client", "true")
    kwargs["headers"] = headers
    return _orig_request(self, method, url, **kwargs)


requests.Session.request = _request
