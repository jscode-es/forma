# Security Policy

Please do not open public issues for vulnerabilities. Use [private vulnerability reporting](https://github.com/jscode-es/forma/security/advisories/new).

We aim to acknowledge reports within 7 days. Only the latest release on `main` is supported.

Areas of particular interest: Electron IPC and preload surface, the `app://` protocol handler, model download and loading, and handling of untrusted 3D/image files.

## Network use

Forma connects to the network only when you ask: downloading model weights (Hugging Face and GitHub, pinned revisions verified by SHA-256) and checking for newer revisions. Engines run with offline settings and must not download anything.
