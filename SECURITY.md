# Security scope

This project assumes one trusted tenant. Every authenticated caller has administrative access. Keep evaluation instances on localhost and use a random token. Do not put secrets in URLs, logs, examples, or commits.

Containers drop capabilities, run without root, and use a read-only root filesystem. These controls do not replace application authorization or a secure host.

Report vulnerabilities to sergheygindac@gmail.com with a minimal reproduction and affected revision. Do not publish real credentials or private data in an issue.
