# Domain reference

Forma generates, entirely locally:

- 3D meshes from text or reference images
- Rigs (skeleton + skin weights)
- Animations from text or reference
- Textures/paint from text or reference

Conventions to settle as the pipelines land (update this file when decided):

- Interchange format: glTF/GLB first; export FBX/OBJ.
- Models live in the user data directory, never in the repo (`models/` is git-ignored).
- Each model integration documents its license, VRAM requirement and checksum.
- Long jobs run in worker processes and report progress over IPC.
