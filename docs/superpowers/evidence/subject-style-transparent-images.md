# Subject priority and real transparent candidates

## Reproduced cause

The user's recent job logs showed the untranslated subject `Jarrón` followed by the complete Japanese fantasy/diorama style. The style occupied most of SDXL's short text context and introduced scene associations. Simply appending an instruction to the same text did not isolate the requested subject.

## Changes

Qwen now receives the object request and style in separate inference calls using one loaded CPU model. The first call translates only the object and its explicit attributes; the second extracts a compact appearance list, excluding scenery, props and other subjects. The final prompt starts with the subject, retains framing and drops trailing style attributes when necessary to fit both CLIP tokenizers. No negative prompt is added to the four-step CFG-0 checkpoint.

The style field accepts 2000 characters, grows within a larger popover and uses Kivora's live `length/max` counter. Main validates that limit and history retains the full original style.

RGB drafts remain private. SDXL is released before loading pinned BiRefNet for local segmentation. Final PNGs receive a validated alpha mask; hidden background RGB is cleared without premultiplying partially transparent edges. Main validates format, bounded dimensions, successful decoding and meaningful alpha after the worker exits, before publishing results. Invalid, empty or opaque outputs are rejected, including a worker changing its output after the result message. The preview checkerboard is UI-only.

## Real generation

On the RTX 5070, request `jarrón`, the user's full Japanese fantasy/diorama style, 1024 px, seeds 42–45 produced four vase candidates. The effective prompt was:

```text
vase, hand-painted, stylized Japanese design, rounded shapes, pastel colors, single isolated object, centered, full view, empty white background, studio lighting
```

The final cutouts preserve the vase as the main object. Each alpha mask has one foreground component larger than 0.1% of the image; all four corners are alpha zero. The style is a compact approximation and secondary palette terms can be omitted by the language model.

| Seed | Fully transparent pixels | Opaque pixels (alpha ≥250) |
| --- | --- | --- |
| 42 | 66.52% | 33.14% |
| 43 | 53.48% | 45.90% |
| 44 | 55.17% | 44.31% |
| 45 | 60.63% | 38.90% |

All files are RGBA with alpha range 0–255. Pixels outside the mask are `(0, 0, 0, 0)`; an additional Pillow regression checks that semi-transparent foreground colors stay unmodified.

## Validation

- Full Playwright run: 64 passed. Focused alpha/style/prompt workflows also passed, covering long styles, the live counter, history, real PNG decoding and rejected opaque/empty results.
- Python: 17 passed, including encoder budgets, separate subject/style calls, pipeline/segmentation memory ordering and alpha behavior. SDXL tests also passed in the actual GPU engine environment.
- Node: 99 passed, one skipped. Typecheck, lint, build, 920-key i18n parity and plugin catalogs passed.
- Electron review found no issue with bounded input, decoded-image limits, pinned local code/model loading, process-result validation or memory ordering.
- No external account generation was executed. Codex's worker requests transparent PNG output and is subject to the same main-process alpha gate; its existing per-generation consent is unchanged.
