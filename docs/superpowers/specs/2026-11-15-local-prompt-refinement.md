# Local prompt refinement for SDXL

The user approved using a local language model to improve object descriptions before SDXL generation, including Spanish requests such as `Jarron chino` that should describe a vase rather than a person.

Use Qwen3-1.7B through the Transformers/PyTorch runtime already installed for SDXL. This avoids introducing llama.cpp binaries or a separately managed Ollama server. Run the language model on CPU with thinking disabled, bounded output and a fixed seed; release it before loading SDXL. Produce one concise English object description that preserves the subject, style and requested details. Keep the original prompt in project history and record the effective prompt in the job log.

Declare pinned safetensors and tokenizer files with sizes, SHA-256 and Apache-2.0 license in the SDXL engine weights catalog. Generation uses verified local paths with remote code disabled and no network access. The preparation stage appears inside the existing progress button. Invalid or truncated language-model output fails the job before loading SDXL rather than silently generating a different result. No new IPC or renderer access to model files is needed.

Validate unit behavior, model availability and cleanup ordering, then evaluate real Spanish and English object prompts locally. Image generation remains probabilistic; the change improves the description supplied to SDXL rather than guaranteeing its visual output.

The shared SDXL style setting is edited through a gear beside engine help, persists on this computer and is copied into each job as a bounded `stylePrompt` text parameter. The worker translates the object and extracts style attributes separately before composing a subject-first prompt within both text encoders' limits. Original prompts remain separate; reusing a history entry restores the style recorded for that generation. An empty setting removes the shared style. The existing parameter IPC validates its type and 2000-character maximum in main; the editor displays its live character count.
