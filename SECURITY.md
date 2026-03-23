# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

Support begins with the first `1.0.0` release. Unreleased commits and older
`0.x` builds may receive fixes, but they are not covered by the formal support
policy.

## Reporting a Vulnerability

If you discover a security vulnerability in crap4ts, please report it
responsibly.

**Do not open a public issue.** Instead, email **security@breezybayslabs.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. Affected versions
4. Any potential impact assessment

You should receive an acknowledgment within 48 hours. We aim to provide a status
update within 7 days and will work with you to understand the issue, confirm the
impact, and coordinate a fix before any public disclosure.

## Scope

crap4ts is a static analysis tool that reads source files and coverage reports. It does not:

- Execute analyzed code
- Make network requests
- Process untrusted user input at runtime (beyond file paths passed via CLI)

The primary attack surface is malicious file paths or crafted coverage JSON
files. If you find a way to exploit these inputs, please report it.

## Out of Scope

The following generally do not qualify as security vulnerabilities by
themselves:

- Incorrect CRAP scores caused by normal configuration mistakes
- Missing support for a coverage provider or report format
- Performance issues on unusually large repositories without a demonstrated
  security impact
- Cosmetic CLI/reporter defects without a confidentiality, integrity, or
  availability impact
