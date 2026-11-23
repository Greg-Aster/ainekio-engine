# @ainekio/engine

A framework-neutral TypeScript ECS 3D game and simulation engine with modular contracts and isolated adapters for **Three.js**, **Rapier3D**, **PeerJS**, and **Browser/Web Audio** platforms.

Extracted from the Merkin/Ainekio ecosystem so anyone can fork, study, or build 3D worlds and robot simulations on top of the engine without website or monorepo baggage.

## Architecture

The engine enforces strict one-way layering (`pnpm audit:boundaries`):

- **Root public API (`@ainekio/engine`)**: Framework-neutral ECS `core`, `math`, `data` schemas/manifests, fixed-step `runtime`, `client-api`, and `modules`. Never exposes Three.js, Rapier, Svelte, Astro, or browser globals.
- **Engine Modules (`@ainekio/engine/modules/*`)**: Pure TypeScript contracts for `assets`, `audio`, `camera`, `debug`, `input`, `networking`, `physics`, `rendering`, and `scene`.
- **Multiplayer (`@ainekio/engine/multiplayer`)**: Framework-neutral peer state, messages, session lifecycle, and ECS remote-player replication systems.
- **Adapters (`@ainekio/engine/adapters/*`)**: Isolated concrete integrations:
  - `@ainekio/engine/adapters/three` — Three.js renderer, lighting, terrain splatting, skybox, materials, and articulated rigs.
  - `@ainekio/engine/adapters/rapier` — Rapier3D physics world and character/collider adapter.
  - `@ainekio/engine/adapters/browser` — Browser platform loop, input, Web Audio, PeerJS transport, room directory, and robot audio bridge.

## Installation

Install from a tagged GitHub release (or a local path while developing side-by-side):

```bash
pnpm add github:Greg-Aster/ainekio-engine#v0.1.0
```

Peer dependencies are optional per adapter—install only the adapters your app uses:

```bash
pnpm add three @dimforge/rapier3d-compat peerjs
```

## Subpath Exports

| Import | Contents |
| --- | --- |
| `@ainekio/engine` | Root framework-neutral engine API (`core`, `math`, `data`, `runtime`, `client-api`, `modules`) |
| `@ainekio/engine/core` | `World`, `Entity`, `CommandBus`, `EventBus`, `System` |
| `@ainekio/engine/math` | `vec3`, `quat`, vector/transform helpers |
| `@ainekio/engine/data` | Scene/level manifests, schemas, loaders, serializers, replay |
| `@ainekio/engine/runtime` | Fixed-step `EngineRuntime` loop |
| `@ainekio/engine/client-api` | Host/UI snapshot & command bridge |
| `@ainekio/engine/modules/*` | `assets`, `audio`, `camera`, `debug`, `input`, `networking`, `physics`, `rendering`, `scene` |
| `@ainekio/engine/multiplayer` | `MultiplayerSession`, protocol messages, replication systems |
| `@ainekio/engine/adapters/three` | Three.js rendering adapter |
| `@ainekio/engine/adapters/rapier` | Rapier3D physics adapter |
| `@ainekio/engine/adapters/browser` | Browser platform, audio, and PeerJS networking adapters |

## Development

```bash
pnpm install
pnpm check   # runs boundary audit, Biome lint, TypeScript type-check, build, and contract tests
```

## License

MIT
