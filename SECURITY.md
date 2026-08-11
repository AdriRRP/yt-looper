# Security policy

## Supported versions

Security fixes target the latest released version of YT Looper. Older development snapshots are not
supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository's private
**Security → Report a vulnerability** flow and include affected versions, browser, reproduction
steps, impact and any suggested mitigation. Remove tokens, private URLs and personal library data
from evidence.

You should receive an acknowledgement within seven days. After validation, the project will
coordinate a fix and disclosure before publishing technical details. There is currently no paid
bug-bounty program.

## Scope

Relevant reports include shared-link validation bypasses, unauthorized access to local extension
data, permission escalation, remote-code execution, supply-chain compromise and ways for ordinary
web content to invoke privileged extension behavior. YouTube behavior that reproduces without the
extension is generally out of scope unless YT Looper materially increases its impact.
