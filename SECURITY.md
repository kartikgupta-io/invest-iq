# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `main` (latest) | Yes |
| Older tags | No — upgrade to `main` |

## Reporting a vulnerability

**Do not open a public issue** for a security problem. Use GitHub's private
[security advisory](https://github.com/kartikgupta-io/invest-iq/security/advisories/new)
form, or contact the repository owner directly.

Include:

- affected endpoint or component,
- steps to reproduce,
- impact (data exposure, injection, denial of service, etc.),
- suggested fix if you have one.

You should receive an acknowledgement within a few days. Please give us a reasonable window to
fix the issue before public disclosure.

## Known prototype limitations

This repository is a development prototype. The following are **not** implemented and must be
added before exposing it to untrusted users:

- server-side authentication / authorisation (the workspace is browser-local),
- rate limiting and abuse protection on the API,
- user-bound ownership of alerts, screens and holdings,
- secret management for any future upstream API keys.

See `docs/SDLC_SECOPS_REPORT.md` for the full assessment.
