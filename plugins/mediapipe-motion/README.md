# Local video motion

Install this optional CPU engine in Models → Engines. It uses Python 3.11, MediaPipe 0.10.21 and the official Pose Landmarker Lite model (Apache-2.0). Python packages are version pinned. Model version, size and SHA-256 are pinned in the manifest and checked by Forma before use. Inference never downloads weights or uploads video.

Input: one locally imported MP4/WebM video and a canonical Forma humanoid rig in embedded GLB format. Keep a single person fully visible, including shoulders, hands and feet. Set FPS (5–30), maximum input duration (1–30 seconds) and confidence. Video decoding is bounded to 30 seconds, 4K frames and 120 source FPS.

Output: a portable animation clip with the target skeleton's rest transforms and estimated local bone quaternion tracks. Import the result into the independent animation library and preview/apply it through the timeline. Missing or low-confidence detections create gaps between real keys; fewer than two confident poses fail the job. The report records accepted and rejected frames.

Coordinates convert MediaPipe camera coordinates `(x, y, z)` to glTF `(x, -y, -z)`. Anatomical left/right are preserved. This estimates bone swing from body landmarks, including hands and feet; it does not recover twist, finger joints, facial motion, precise depth, floor contact or calibrated root translation. The head and neck retain rest orientation. Root translation stays at rest, so captured locomotion plays in place. Occlusion, camera motion and multiple people can produce incorrect estimates. Review the clip before applying it.

Official documentation: [Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), [BlazePose GHUM model card and license](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).

CLI installation: `node scripts/install-plugin.mjs mediapipe-motion --accept-license`. Then accept and download Pose Landmarker Lite in Forma's Models screen. No external text-to-motion provider is configured.
