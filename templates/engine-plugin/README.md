# My engine

One paragraph: what the engine does, which model it runs and what it returns.

The plugin code in this folder is MIT, like Forma. **Third-party code and weights are not part of Forma**: list here what the installer downloads and under which licenses.

## Requirements

- GPU, VRAM and CUDA needs (or "runs on CPU")
- Python version and anything to build
- Disk for the Python environment and for the weights

## Activate

In Forma open **Models → Engines** and click **Activate** on My engine. From the command line:

```bash
npm run plugin:install -- my-engine --accept-license
```

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| Height (m) | 1 | Height of the card |
| Visible from both sides | on | |

## Reference run

Hardware, inputs, settings, time and result of a real run, so reviewers can reproduce it.

Pinned versions: code and weights with their commits.
