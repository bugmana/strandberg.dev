---
layout: legal
title: ShellLite - Privacy Policy
description: Official privacy policy for ShellLite, the cross-platform SSH client and terminal emulator.
permalink: /privacy/shelllite/
back_url: https://shell.strandberg.dev
back_label: Back to ShellLite
---

# ShellLite Privacy Policy

**Effective Date:** September 8, 2026 &middot; **Publisher:** Aron Strandberg ([aron@strandberg.dev](mailto:aron@strandberg.dev))

---

## Executive Summary
**ShellLite** (`com.bugmana.shell_lite`) is a client-side SSH terminal emulator developed by Aron Strandberg. ShellLite is architected with a strict privacy-first, on-device design: **we do not collect, track, transmit, monetize, or sell any personal data, session logs, or server credentials.**

Everything configured or executed within ShellLite remains entirely on your personal device.

---

## 1. Zero Data Collection & Zero Telemetry
ShellLite does not collect any data whatsoever:
- **No Third-Party Analytics:** We do not embed Google Analytics, Firebase, Mixpanel, or any other usage tracking frameworks.
- **No Crash Beacons:** No automated remote crash diagnostics or stack traces are phoned home.
- **No Advertising:** ShellLite contains no ads, promotional tracking SDKs, or device fingerprinting.
- **No User Profiles:** We do not require account registration, email sign-ups, or social logins to use the software.

---

## 2. Hardware-Backed Local Credential Storage
To allow persistent connections, ShellLite stores server connection profiles and authentication credentials locally on your hardware. These credentials never leave your physical device:
- **Android:** Credential passphrases, private keys, and passwords are encrypted using the **Android KeyStore** provider via AES-GCM-256 hardware-backed encryption.
- **iOS:** Secrets are stored within the **Apple Keychain Services** protected by the device's Secure Enclave.
- **Desktop & Web:** Credentials are saved to local sandboxed application storage and are never uploaded to any remote service.

---

## 3. Direct Peer-to-Peer SSH Connections
When you initiate an SSH session in ShellLite:
- Traffic flows **directly** between your client device and your remote server's SSH port (typically TCP port 22).
- For web browser builds (`shell.strandberg.dev`), traffic flows over an encrypted WebSocket connection directly to your designated WebSocket SSH bridge (`websockify`).
- At no point is SSH traffic routed through, intercepted by, or proxied across any developer-owned servers or third-party relays.

---

## 4. Live Server Telemetry
ShellLite provides an optional live system telemetry monitor (CPU, memory, disk usage, and system uptime) for configured servers:
- Telemetry commands (`uptime`, `top`, `free`, `df`) are executed exclusively over your existing authenticated, encrypted SSH channel.
- Telemetry metrics are kept strictly in volatile, transient memory on your device to update the UI and are never persisted to long-term storage or shared externally.

---

## 5. On-Device Cryptographic Key Generation
When using ShellLite's built-in SSH key generator:
- Key pairs (such as Ed25519) are produced locally on your device using hardware-backed cryptographic entropy.
- The private key is placed directly into local secure storage and never leaves the device.
- The public key is presented for you to copy to your target server's `~/.ssh/authorized_keys`.

---

## 6. Data Deletion & User Rights
You retain complete sovereignty over your data:
- **Profile Deletion:** Deleting a server profile within the app instantly and permanently purges that profile and its associated encrypted credentials from local storage.
- **App Uninstallation:** Uninstalling ShellLite immediately destroys all stored server profiles, keys, terminal preferences, and cached configurations.

---

## 7. Policy Updates
Should this policy be amended, updates will be reflected with a revised effective date on this page. Because ShellLite does not collect contact information, users are encouraged to review this page periodically.

---

## 8. Contact & Publisher Information
For questions, security disclosures, or concerns regarding ShellLite or this Privacy Policy, please reach out to:

- **Developer / Publisher:** Aron Strandberg
- **Location:** Stockholm, Sweden
- **Email:** [aron@strandberg.dev](mailto:aron@strandberg.dev)
- **Website:** [strandberg.dev](https://strandberg.dev)
- **Source Repository:** [github.com/bugmana/ShellLite](https://github.com/bugmana/ShellLite)
