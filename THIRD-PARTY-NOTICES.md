# Third-Party Notices

XPIA Tools' own source code is licensed under the [MIT License](./LICENSE).

This project depends on third-party open-source software. Those components remain
under **their own licenses** — the MIT license covers this project's original code
only, not its dependencies. All bundled and installed dependencies use permissive
licenses, with the sole copyleft component being the LGPL-3.0 `libvips` library used
(as a separately installable, replaceable shared library) by `sharp`.

To regenerate a complete, current inventory of installed dependency licenses:

```bash
# From server/ and client/ respectively:
npx license-checker-rseidelsohn --production --summary
```

## Notable components

| Component | Used for | License |
| --- | --- | --- |
| `sharp` | Server-side image processing/generation | Apache-2.0 |
| `libvips` (`@img/sharp-libvips-*`) | Native image library loaded by `sharp` | **LGPL-3.0-or-later** |
| Inter font (`server/src/assets/fonts`) | Embedded font for document/image generation | **SIL OFL-1.1** |
| `jszip` | Archive generation (DOCX/PPTX/XLSX packaging) | MIT (dual `MIT OR GPL-3.0`; MIT elected) |
| `react`, `react-dom`, `react-router-dom` | Client UI | MIT |
| `lucide-react` | Client icons | ISC |
| `express`, `helmet`, `cors`, `zod`, and other server libraries | API server | MIT |
| `@azure/*` SDKs | Cosmos DB, Blob Storage, Communication Services | MIT |
| `dotenv` | Environment configuration | BSD-2-Clause |
| `typescript` | Build tooling | Apache-2.0 |

## libvips / LGPL-3.0 notice

`sharp` uses the **libvips** image processing library, distributed as prebuilt,
platform-specific, optional npm packages (`@img/sharp-libvips-*`) under the
**LGPL-3.0-or-later** license. libvips is used as a separate, dynamically loaded
shared library and is not statically combined with this project's code. You may
obtain, rebuild, or replace libvips independently; see:

- libvips: https://github.com/libvips/libvips
- sharp: https://github.com/lovell/sharp

The LGPL-3.0 components remain licensed under LGPL-3.0. Nothing in this project's MIT
license alters their terms.

## Inter font / SIL OFL-1.1 notice

The Inter font files bundled under `server/src/assets/fonts/` are licensed under the
**SIL Open Font License, Version 1.1** (see `server/src/assets/fonts/LICENSE.txt`).
The OFL permits bundling and redistribution with software; the font files themselves
remain under the OFL and are not relicensed under MIT.

- Inter: https://github.com/rsms/inter
