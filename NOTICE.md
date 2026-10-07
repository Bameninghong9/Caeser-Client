# Authentication reference and license

Caeser Client 0.3.2 is provided under GPL-3.0-only; see LICENSE.

The Xbox SISU authentication implementation in src/auth/sisu.cjs was developed
using the Windows authentication flow in NoRiskClient/noriskclient-launcher as
a reference, including its signed-request protocol and endpoint sequence:

https://github.com/NoRiskClient/noriskclient-launcher/blob/2a283c5f35e946554a1afaaafacc7776c63a4eb4/src-tauri/src/minecraft/auth/minecraft_auth.rs

That project is GPL-3.0 and credits LiquidLauncher as its original base.
The implementation here uses Node.js cryptography and Electron window APIs.
NoRisk branding, backend services and account credentials are not included.
The fixed public application identifier is an OAuth protocol identifier, not
a client secret. Microsoft controls service availability and account access.

Third-party dependencies retain their own licenses. The supplied Caeser mod
declares CC0-1.0. See README.md for the origin of supplied artwork and font.
When distributing modified builds, include the corresponding source and GPL
license. The release source archive is provided in dist alongside the binaries.
