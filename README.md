# nuke-web-canvas

Read-only [Nuke](https://www.foundry.com/products/nuke) node graph for the browser. Paste a `.nk` or `.gizmo` script and pan, zoom, and step into groups.

The graph is drawn with [TypeGPU](https://typegpu.com) on WebGPU: orthographic 2D, not a DOM node per Nuke node. WebGPU is required.

Storybook: https://derek-rein.github.io/nuke-web-canvas/

## Scripts

```bash
pnpm install
pnpm dev
pnpm test
pnpm storybook
pnpm build-storybook
```

## Component

```tsx
import { NukeDag } from "./NukeDag";

<NukeDag script={nkText} onSelectNode={(node) => console.log(node)} />;
```

`xpos` and `ypos` are the top-left of each node, matching Nuke. Connections come from the script's stack (`set`, `push`, and `inputs`).
