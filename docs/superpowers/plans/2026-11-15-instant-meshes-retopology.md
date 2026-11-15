# Replace Blender retopology with Instant Meshes

The user requested replacing the current retopology backend with the independent Instant Meshes integration used in the previous application. Other Blender tools remain unchanged.

- [x] Add a CPU Python plugin with pinned dependencies, an installation-only verified Windows binary download and a verified offline worker. Generate UVs with XAtlas, preserve simple material factors and reject unsupported textured/rigged inputs before publishing.
- [x] Remove the Blender retopology task and route the existing preview operation exclusively to Instant Meshes. Expose activation and platform compatibility through the existing engine manager; remove the Blender requirement from the retopology UI.
- [x] Validate real quad output, face limits, world transforms, UVs, preserved material factors, source immutability and unsupported-input rejection. Add CI-safe unit coverage and update the relevant Electron workflow.
- [x] Update manuals, engine evidence and screenshots; run typecheck, lint, build, unit and relevant E2E checks, and obtain Electron security review.

Instant Meshes may exceed its requested face target. Retrying with a lower target is permitted; results exceeding the requested maximum are rejected. No Blender or decimation fallback is used. Windows is the supported binary platform for this integration; other platforms must be marked incompatible until their own pinned binaries are integrated.
