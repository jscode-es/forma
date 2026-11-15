# Local Prompt Refinement Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for implementation in this session.

**Goal:** Rewrite object prompts locally before SDXL, preserving the original request and freeing memory before image inference.

**Architecture:** Extend the existing SDXL Python worker with a bounded CPU Transformers helper. Declare the Qwen weights through the existing engine catalog and expose preparation through existing job stages and the generation button.

**Tech Stack:** Python 3.11, PyTorch 2.7.1, Transformers 4.57.6, Qwen3-1.7B, existing Electron job protocol and React i18n.

**Spec:** docs/superpowers/specs/2026-11-15-local-prompt-refinement.md

## Global Constraints

No new IPC, server, dependencies, or generation-time network access. Pinned weights and license; preserve original prompts and explicit input details. CPU model must be released before GPU inference.

## Review Focus

Malformed or truncated model replies; subject substitution; stale prompt history; tokenizer special tokens; CPU/GPU memory overlap.

### Task 1: Local helper and weights

- [x] Add Python regression tests for inference settings, validation and pipeline ordering; observe the initial failure.
- [x] Implement the CPU helper and integrate it before SDXL loading.
- [x] Register Qwen weights, update engine version and installation metadata.
- [x] Run Python tests and validate the engine manifest.

### Task 2: Progress, documentation and real validation

- [x] Display prompt preparation in the existing progress button and translate the job stage.
- [x] Document the automatic step and runtime choice.
- [x] Download and verify model files; evaluate real object prompts and address observed quality problems.
- [x] Run typecheck, lint, build, relevant tests and independent review.

Validation: Python 7/7; Node 97 passed, 1 skipped; prompt Playwright 3/3; typecheck, lint, build, i18n and plugin validation passed. Independent review found no blocking issue; real seven-prompt evaluation exposed residual attribute drift. An offline end-to-end production-worker run of `Jarron chino` generated a vase using `Chinese vase` with seed 42. Installed engine upgraded to 1.1.0 with verified Qwen weights; prior engine files backed up outside the repository.

Shared-style follow-up (SDXL 1.2.0): a real offline run on the RTX 5070 with seed 42 and `low-poly, pastel colors, isometric view, soft lighting` produced a 1024 px PNG. The effective prompt retained `Chinese vase` and every style phrase before object framing. Current integration validation: 63/63 Playwright tests, 98 Node tests passed with one skipped, 8/8 Python tests, typecheck, lint, build and 898-key English/Spanish parity. Plugin catalogs and template/demo/mesh smoke jobs passed. The Electron security review found no issue in the bounded text parameter validation.
