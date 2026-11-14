# Phase 15: local video motion evidence

Verified on Windows on 2026-11-14. The user authorized local dependencies and model downloads and explicitly declined external text-to-motion providers. The optional `mediapipe-motion` plugin now performs real CPU inference; external text-to-motion remains pending.

## Installed runtime and reproducibility

Initial inspection found Python 3.13.7 with Torch/NumPy but no MediaPipe/OpenCV, and Python 3.11.9 without those libraries. No existing pose model appeared in Forma's engines or the inspected Hugging Face/Torch caches. The existing Python 3.11.9 created an isolated plugin environment through `node scripts/install-plugin.mjs mediapipe-motion --accept-license`. No system Python packages were changed.

Runtime: `C:/Users/brimo/AppData/Roaming/forma/engines/mediapipe-motion/.venv/Scripts/python.exe`. MediaPipe 0.10.21, OpenCV contrib 4.11.0.86, NumPy 1.26.4 and SciPy 1.15.2 are installed. The complete resolved dependency versions are pinned in the plugin's requirements file. These versions were exercised on Windows/Python 3.11; other platforms were not exercised.

The model is Google's [Pose Landmarker Lite](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), version `float16/1`, downloaded from the official fixed URL:

```text
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
size: 5777746 bytes
sha256: 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a
```

The [official model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) identifies Apache-2.0 for the model. The plugin displays dependency/model notices and uses Forma's normal license/download/receipt flow. The dedicated `mediapipe` weights source permits only this official model family and version, rejects HTTP redirects and checks the final URL exactly. Existing source allowlists are unchanged. Runtime verifies the model SHA-256 again and never downloads files.

Installation was completed through the actual compiled `plugins.startInstall`, `weights.downloadWeights` and `weights.verifyWeights` modules against Forma's user data. Their Python process, SQLite, network transfer and SHA verification were real; a small `app`/`BrowserWindow` stub supplied app paths/version/languages because a standalone Electron helper failed at startup with Windows `AssignProcessToJobObject: (50)`. The final state was `pluginStatus=installed`, `modelStatus=installed`, `licenseAccepted=true`, with the normal `.forma-installed.json` marker and weight `receipt.json`. The installed model is `C:/Users/brimo/AppData/Roaming/forma/models/mediapipe-pose-lite/1/pose_landmarker_lite.task`. This module-level installation check does not claim a UI installation test.

## Input and output contract

Task `video-to-motion` requires one locally staged video and one canonical 19-bone Forma humanoid GLB, with zero reference images. Parameters: integer `fps` 5–30 (default 15), integer `maxSeconds` 1–30 (default 10), and `confidence` 0.1–0.95 (default 0.5). Decoding is sequential, capped at the configured duration, 4K frames and source FPS 1–120.

MediaPipe VIDEO mode returns 33 estimated body landmarks and their confidence. The [official coordinate definition](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) places world landmarks at the hip midpoint. The engine converts camera coordinates `(x,y,z)` to glTF `(x,-y,-z)`, preserves anatomical left/right, estimates bone swing relative to the actual target rest transforms, and derives local quaternions through the parent hierarchy. Quaternion signs remain continuous across keys.

Output: `clip.json` (`animation-clip`, portable clip version 1) and `motion-report.json` (`motion-report`). The report records model revision/hash, examined/accepted/rejected frames and limitations. Low-confidence frames have no fabricated keys; fewer than two confident poses fail with `insufficient-pose-frames`. Target bytes are never modified.

Limits: one visible person; no calibrated root translation, floor contact, fingers, face or bone twist. Root translation stays at rest. Head and neck retain their local rest orientations. Existing target joints must use TRS with unit scales, unique canonical names and identity nonjoint ancestors. Occlusion, camera motion and ambiguous depth can degrade the result. Interpolation between retained keys remains the timeline's normal LINEAR/spherical rotation interpolation; rejected frames are not claimed as inferred measurements.

## Verification

The test suite first failed because the runtime did not exist, then passed after implementation. Command:

```powershell
$env:FORMA_MOTION_MODEL = Join-Path $env:TEMP 'forma-motion-validation'
$env:FORMA_MOTION_VIDEO = Join-Path $env:TEMP 'forma-motion-validation/pose-world.mp4'
$env:FORMA_MOTION_TARGET = Join-Path $env:TEMP 'forma-rig-evidence/test_auto_real_weights_deformation_and_original/output-0/model.glb'
& 'C:/Users/brimo/AppData/Roaming/forma/engines/mediapipe-motion/.venv/Scripts/python.exe' plugins/mediapipe-motion/tests/runtime_test.py -v
```

Result: 8 tests passed in 7.628 seconds, including two real subprocess inference tests. Unit coverage checks quaternion direction/normalization and antiparallel vectors, camera-axis conversion and confidence rejection, parent-relative rest transforms, insufficient detections, missing-frame timing/sign continuity, and rejection of unrigged/noncanonical/external-resource targets.

The real positive input is Google's [published exercise demonstration video](https://mediapipe.dev/images/mobile/pose_world_landmarks.mp4), linked from the [official MediaPipe Pose documentation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md). The 522,964-byte video contains a real moving person and the original landmark overlay. It was downloaded to a temporary validation folder, not bundled with Forma. The target is the real heat-weighted humanoid generated and verified during Phase 14.

At default confidence 0.5, three seconds at 15 output FPS produced 45 accepted poses out of 45 examined, 17 rotation tracks, and frame range 0–44. All quaternions are finite and normalized; more than five tracks change over time. A 30-frame black MP4 fails without emitting a clip. Both inference subprocesses use offline environment flags and closed-port proxy variables; those are best-effort guards, not an OS network sandbox. No user assets or prompts were uploaded anywhere.

The default-confidence clip also passed `validateAnimationClip`, `writeAnimationClip` and `readAnimationModel` from Forma's actual animation operations. The exported GLB is 491,728 bytes with 19 bones, one clip and 17 tracks. Blender 5.2.1 reimported it and evaluated actual skin deformation: 6,596 evaluated vertices across two meshes; maximum vertex displacement between first and last samples was 0.9420437667 model units. The target source checksum remained unchanged. Temporary artifacts reside under `C:/Users/brimo/AppData/Local/Temp/forma-motion-validation/`, including the clip, report, exported GLB and deformation verification scripts/report. This verifies the inference → clip → GLB → skin-deformation path; it does not establish capture accuracy or production motion quality.

Repository-wide typecheck, lint, build and Electron/UI workflow verification are tracked by the main Phase 15 implementation, not inferred from these Python tests.

## Optional external text motion: intentionally pending

DeepMotion has a real [SayMotion REST API](https://github.com/DeepMotion/SayMotion-REST-API), rather than an unspecified generic endpoint. Its published contract authenticates Client ID/Client Secret with `GET {host}/account/v1/auth`, returns a `dmsess` cookie, submits `POST {host}/job/v1/process/text2motion`, then polls and retrieves download URLs. The production host must be obtained from DeepMotion. Its [API access page](https://www.deepmotion.com/saymotion-api) currently requires partner access; its [product documentation](https://www.deepmotion.com/doc/saymotion) lists GLB/FBX/BVH export. A real integration would require the user's provider selection, approved API access/host and credentials, plus verified download formats and rig compatibility. No provider account was created, no credentials were inspected, and no external inference was attempted. The user declined this integration for now.
