# Subject fidelity, shared style and real transparent candidates

The user supplied a long Japanese fantasy/diorama style that displaced a simple vase request. Object content must remain authoritative; style can change surface, shape language and palette, but cannot add subjects, scenery, props or a stage. All published generated images must have real transparency. The shared style field needs more space and a live length/max counter.

- [x] Reproduce the failing composition and test the supplied style against vase and other object requests. Separate object translation from a short appearance-only style extraction, keep subject tokens first and respect both SDXL text encoders' token budgets.
- [x] Raise bounded shared-style storage/IPC/UI limits to 2000 characters. Use Kivora's counter and a larger textarea/popover; preserve style history and original prompt.
- [x] Add pinned shared BiRefNet weights to SDXL, generate candidates before loading the segmentation model, produce real RGBA PNGs, validate meaningful transparency and fail rather than publish opaque results. Request transparent output from Codex and validate all published text-to-image results in main.
- [x] Add regression coverage for input priority, long style persistence/counter, actual alpha and memory ordering. Validate real SDXL candidates using the supplied style, inspect the output and alpha, update documentation, run required checks and Electron review.
