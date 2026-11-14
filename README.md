# Forma

Local-first AI studio to generate **3D models, rigs, animations and textures** from text prompts or reference images. Everything runs on your machine: no cloud, no accounts.

> Status: early scaffold. The app shell (Electron + Next.js + SQLite) works; the generation pipelines are being built. See the [roadmap](docs/roadmap.md).

## Features (planned)

- Text-to-3D and image-to-3D mesh generation
- Automatic rigging
- Animation from text or reference
- AI texture painting
- Local model management (download, switch, run on GPU/CPU)

## Stack

| Layer | Technology |
| --- | --- |
| Desktop | Electron |
| UI | Next.js (static export) + [Kivora](https://www.kivora.pro/docs) |
| Storage | SQLite (`node:sqlite`, no native modules) |
| Inference | Local models (see [architecture](docs/architecture.md)) |

## Getting started

Requirements: Node.js 20.19+ (24 recommended) and npm.

```bash
git clone https://github.com/jscode-es/forma.git
cd forma
npm install
node node_modules/electron/install.js   # only needed if your npm blocks install scripts
npm run dev
```

Other scripts: `npm run build`, `npm start`, `npm run dist`, `npm run lint`, `npm run typecheck`.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Look for issues labeled `good first issue`.

## License

[MIT](LICENSE)
