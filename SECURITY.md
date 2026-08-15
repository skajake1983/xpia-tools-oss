# Security Policy

## Responsible use

XPIA Tools generates documents, payloads, and web pages containing **cross-prompt
injection (XPIA)** techniques. It is intended solely for **authorized security research
and testing** — evaluating the resilience of AI/LLM systems that you own or have explicit
written permission to test.

Do **not** use this software to attack, compromise, or manipulate systems, users, or
services without authorization. You are responsible for complying with all applicable
laws and for the consequences of how you use the generated artifacts. The maintainers and
contributors accept no liability for misuse (see the [MIT License](./LICENSE) disclaimer).

## Supported versions

Security fixes are applied to the `main` branch. There are no long-term support branches.

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

- Preferred: open a private **GitHub Security Advisory** for this repository
  (`Security` tab → `Report a vulnerability`).
- Alternatively, contact the maintainer through GitHub.

Please include:

- A description of the issue and its impact
- Steps to reproduce (proof of concept if possible)
- Affected component/version

We aim to acknowledge reports promptly and will coordinate a fix and disclosure timeline
with you. Please give us a reasonable opportunity to remediate before any public
disclosure.

## Scope

This policy covers the application code in this repository. Vulnerabilities in third-party
dependencies should also be reported upstream to the respective projects
(see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)).
