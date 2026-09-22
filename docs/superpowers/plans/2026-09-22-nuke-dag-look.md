# Nuke DAG Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the read-only DAG match a default Nuke node graph: straight black pipes, default colors and sizes, expression and clone arrows, an orange clone badge, rubber-band multi-select with the read-only hotkeys, and a minimap when the graph leaves the view.

**Architecture:** Layout and link detection stay in `src/nuke` so Vitest never loads TypeGPU. `buildGeometry` turns that scene into straight segments, arrows, and badges. `NukeDag` owns pointer selection, hotkeys, and a DOM minimap. The viewer stays read-only: no inserting, deleting, disabling, or moving nodes.

**Tech Stack:** Vite, React 19, TypeScript strict, Vitest, TypeGPU 2D, pnpm.

## Global Constraints

- `xpos` / `ypos` are the top-left of the node in DAG pixels. Y grows downward. Foundry center is `xpos + screenWidth / 2`, `ypos + screenHeight / 2`.
- One text line is a body of 80×18. Each extra line adds 12px of height. Horizontal padding is 8px per side. Dots are 12×12. A postage stamp is a 46px band above the body. These sizes already exist; do not change them.
- Foundry Node Graph arrow defaults (Nuke 6.2 user guide, still the documented defaults): arrow width 2, arrow head length 12, arrow head width 8, arrows black. Pipes are one straight segment from the output anchor to the input anchor. Do not use cubic beziers.
- DAG background is `#555555`, clear color `[85/255, 85/255, 85/255, 1]`.
- Expression arrows are `#6cbe6c`. Clone arrows are `#e87830`. The clone badge is an orange circle (`#e07020`) with a white `C`, hanging off the left edge of the body. It does not widen the node.
- `tile_color` still overrides the class color. Text luminance rule stays `0.299r + 0.587g + 0.114b > 0.62`.
- Public `NukeDag` props stay `script`, optional `className`, `style`, and `onSelectNode?: (node: DagNode | null) => void`. `onSelectNode` receives the last selected node, or `null` when the selection is empty.
- Read-only. Do not implement Nuke editing shortcuts (delete, disable, rename, insert node, group creation).
- TypeScript strict, `verbatimModuleSyntax`, no `any`. Parser and scene modules must not import `typegpu` or React.
- Tests put one knob per line. Run `pnpm exec vitest run` on the files you touch, then `pnpm exec tsc --noEmit`, before committing.
- Do not change GitHub Pages workflow, repo visibility, or start a Railway deploy.

---

### Task 1: Straight black pipes

**Files:**
- Modify: `src/nuke/scene.ts` (`pipeSamples`)
- Modify: `src/nuke/scene.test.ts`
- Modify: `src/gpu/geometry.ts` (`pushPipe`, `pushArrow`)
- Test: `src/gpu/geometry.test.ts`

**Interfaces:**
- Consumes: `Anchor` `{ x, y, side }` and `pipeSamples(from, to, steps)`.
- Produces: `pipeSamples` returns exactly `[{ x: from.x, y: from.y }, { x: to.x, y: to.y }]`. `steps` is ignored. Pipe triangles use width 2 and black `[0, 0, 0, 1]`. Arrow head length is 12 and full width is 8, same black.

- [ ] **Step 1: Replace the pipe-sample test**

In `src/nuke/scene.test.ts`, replace `pipe samples leave a bottom anchor downward` with:

```ts
test("pipes are a straight segment between the anchors", () => {
  const samples = pipeSamples({ x: 0, y: 0, side: "bottom" }, { x: 10, y: 80, side: "top" }, 4);
  expect(samples).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 80 },
  ]);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec vitest run src/nuke/scene.test.ts -t "straight segment"`
Expected: FAIL because the bezier returns more than two points.

- [ ] **Step 3: Make `pipeSamples` a straight segment**

```ts
export function pipeSamples(from: Anchor, to: Anchor, _steps: number): Array<{ x: number; y: number }> {
  return [
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
  ];
}
```

Delete `controlPoint`, `cubic`, and `clamp` only if nothing else in the file references them.

- [ ] **Step 4: Draw the pipe 2px wide and the head 12×8, both black**

In `pushPipe`, stop scaling width by zoom. Use width `2` and color `[0, 0, 0, 1]`. In `pushArrow`, `size` (head length) is `12` and the half-width (`size * 0.55` today) becomes `4`, so the base is 8px wide. The head uses the same black color as the pipe.

- [ ] **Step 5: Add a geometry assertion**

In `src/gpu/geometry.test.ts`, extend `a pipe reaches both anchors` so a vertex on the pipe is black (`r === 0 && g === 0 && b === 0`) and no pipe vertex is the old gray `0.78`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm exec vitest run src/nuke/scene.test.ts src/gpu/geometry.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/nuke/scene.ts src/nuke/scene.test.ts src/gpu/geometry.ts src/gpu/geometry.test.ts
git commit -m "fix: draw Nuke pipes as straight black arrows"
```

---

### Task 2: Default colors, clone badge, expression and clone arrows

**Files:**
- Modify: `src/nuke/colors.ts`
- Modify: `src/nuke/scene.ts`
- Modify: `src/nuke/scene.test.ts`
- Modify: `src/gpu/geometry.ts`
- Modify: `src/gpu/geometry.test.ts`
- Modify: `src/gpu/renderer.ts` (clear color only)
- Modify: `src/NukeDag.tsx` (wrapper background only)
- Modify: `src/NukeDag.stories.tsx` (decorator background only)
- Modify: `.storybook/preview.ts` (dag background only)

**Interfaces:**
- Consumes: `DagNode.cloneOf`, `DagNode.knobs`, `DagNode.kind`.
- Produces: `DagScene.links: LinkArrow[]` where `LinkArrow = { fromId: string; toId: string; kind: "expression" | "clone" }`. `buildScene` fills `links` for the current group only (not nested graphs; each nested `DagScene` has its own `links`). Class colors below are `#RRGGBB` without alpha. DAG background `#555555` everywhere a DAG fill is named `#1c1c1c` or clear `[0.11, 0.11, 0.11, 1]`.

Class colors to set or replace (unknown classes stay `#8a8a8a`):

| Class | Hex |
| --- | --- |
| Merge2, ChannelMerge, Dissolve | 2c3f86 |
| Grade, ColorCorrect, HueCorrect | 6d8199 |
| Copy | a33966 |
| Blur, Defocus | a9683a |
| Roto, RotoPaint | 498244 |
| Transform, TransformMasked, CornerPin2D, Crop | 8a6494 |
| FrameHold | c6a84a |
| Text, Text2 | e4e4e4 |
| Tracker, Tracker4 | d5d5d5 |
| Premult, Unpremult | c8c8c8 |
| Constant, Read, CheckerBoard2 | 4d6d8c |
| Dot | e8e8e8 |
| Input, Output | b4b4b4 |
| Viewer | 4c9a4c |
| Write | 848401 |
| Group, Gizmo, LiveGroup, VariableGroup | 5c6770 |
| BackdropNode | 717171 |
| StickyNote | ccc576 |

- [ ] **Step 1: Write failing tests**

Scene test:

```ts
test("expressions and clones become straight link arrows", () => {
  const scene = sceneOf(`
Tracker4 {
 inputs 0
 name Tracker1
 xpos 0
 ypos 0
}
Transform {
 name Transform1
 translate {{Tracker1.translate} {Tracker1.translate}}
 xpos 200
 ypos 80
}
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 200
}
set Ng [stack 0]
clone $Ng {
 inputs 0
 name Grade1Clone
 xpos 160
 ypos 200
}
`);
  expect(scene.links).toEqual([
    { fromId: nodeNamed(scene.nodes, "Tracker1").id, toId: nodeNamed(scene.nodes, "Transform1").id, kind: "expression" },
    { fromId: nodeNamed(scene.nodes, "Grade1").id, toId: nodeNamed(scene.nodes, "Grade1Clone").id, kind: "clone" },
  ]);
  const clone = nodeNamed(scene.nodes, "Grade1Clone");
  expect(clone.w).toBe(Math.ceil("Grade1Clone".length * 6 + 16));
});
```

Replace `a clone leaves room beside its name for the clone mark` so the width is `Math.ceil("Grade1Clone".length * 6 + 16)` with no extra clone padding.

Second test:

```ts
test("parent and self names are not expression links", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 whitepoint {{parent.whitepoint}}
 xpos 0
 ypos 0
}
Blur {
 name Blur1
 size {{Grade1.size}}
 xpos 0
 ypos 40
}
`);
  const grade = nodeNamed(scene.nodes, "Grade1");
  expect(scene.links.some((link) => link.toId === grade.id)).toBe(false);
  expect(scene.links).toEqual([
    { fromId: grade.id, toId: nodeNamed(scene.nodes, "Blur1").id, kind: "expression" },
  ]);
});
```

Geometry: an expression link vertex has `r` within 0.01 of `0x6c/255` and `g` within 0.01 of `0xbe/255`. A clone link vertex has `r` within 0.01 of `0xe8/255`. Replace `a clone mark sits in the reserved corner` so the `C` glyph has some vertex with `x < clone.x + 4`, and the name glyphs stay at `x >= clone.x`.

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `pnpm exec vitest run src/nuke/scene.test.ts src/gpu/geometry.test.ts -t "expression|clone"`
Expected: FAIL.

- [ ] **Step 3: Implement links, colors, badge, and background**

`linkArrows(nodes)` scans every knob string with `/(?<![\w.])([A-Za-z_][\w]*)\s*\./g`. Ignore `parent`, `this`, `root`, `curve`, and `frame`. A hit that equals another node's `name` in the same group adds one expression arrow from that node to the knob's node. A `cloneOf` id adds one clone arrow. Deduplicate by `kind:from:to`.

Stop adding `CLONE_MARK` to node width. Draw the badge as a circle of diameter 16 whose center is `(node.x, node.bodyY + node.bodyH / 2)`, color `#e07020`, and a white `C` glyph centered in that circle. Node label text is centered on the full body width (no right reserve).

Draw each link as a straight segment of width 1.5 from the source center `(x + w/2, bodyY + bodyH/2)` to the same point on the destination, then a black-free arrow head of length 8 and width 6 in the link color. Expression color `[0x6c/255, 0xbe/255, 0x6c/255, 1]`. Clone color `[0xe8/255, 0x78/255, 0x30/255, 1]`. Draw links after data pipes and before node bodies.

On every image node (`kind === "node"`), draw four 4×3 squares along the bottom of the body, 1px gap, centered: red `#e23b3b`, green `#3cba3c`, blue `#3c6fe2`, white `#f2f2f2`. They must stay inside the body rectangle.

Set the DAG background to `#555555` in the React wrapper, the Storybook decorator, `.storybook/preview.ts` `dag` value, and both renderer clear colors.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm exec vitest run src/nuke/scene.test.ts src/gpu/geometry.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/nuke/colors.ts src/nuke/scene.ts src/nuke/scene.test.ts src/gpu/geometry.ts src/gpu/geometry.test.ts src/gpu/renderer.ts src/NukeDag.tsx src/NukeDag.stories.tsx .storybook/preview.ts
git commit -m "feat: match Nuke colors, clone badges, and link arrows"
```

---

### Task 3: Rubber-band selection and read-only hotkeys

**Files:**
- Create: `src/nuke/select.ts`
- Create: `src/nuke/select.test.ts`
- Modify: `src/gpu/renderer.ts` (`setSelected` takes `readonly string[]`)
- Modify: `src/gpu/geometry.ts` (highlight every id in the set)
- Modify: `src/NukeDag.tsx`
- Modify: `src/NukeDag.stories.tsx` (one sentence in the Sample description)

**Interfaces:**
- Consumes: `DagScene.nodes`, `DagScene.pipes`, `hitTest`.
- Produces:
  - `nodesInRect(scene, rect: { x: number; y: number; w: number; h: number }): DagNode[]` — every node whose box overlaps the rect. `w` and `h` are positive. Overlap is inclusive.
  - `toggleId(ids: readonly string[], id: string): string[]`
  - `upstreamIds(scene: DagScene, id: string): string[]` — `id` plus every node reached by walking `inputs`, without revisiting.
  - `neighborId(scene: DagScene, id: string, direction: "up" | "down"): string | null` — up is the first non-null input; down is the first pipe whose `fromId` is `id`.
  - `selectionBounds(nodes: readonly DagNode[]): { x: number; y: number; w: number; h: number } | null`
  - Renderer `setSelected(ids: readonly string[])`. Empty array clears the outline. `buildGeometry` treats a `ReadonlySet<string> | null` as the selected set (`null` and empty select nothing).

Pointer rules on the canvas, in DAG pixels:

- Middle button, or left button with Alt/Option: pan. Unchanged zoom math.
- Left button on a node, no drag past 4px: plain click replaces the selection with that node. Shift toggles that node. Ctrl or Cmd replaces the selection with `upstreamIds`.
- Left button on empty space: a drag past 4px is the elastic band. The band is a DOM rectangle, 1px `#f2f2f2` stroke, fill `rgba(255,255,255,0.08)`, positioned in the wrapper. On release, the selection becomes `nodesInRect`. Shift unions with the previous selection. A release without dragging clears the selection.
- Double-click still opens a group or gizmo via `enterGroupPath`.
- `F` fits `selectionBounds` of the current selection, or `scene.bounds` when nothing is selected.
- Ctrl/Cmd+A selects every node in the current scene. Arrow Up / Arrow Down call `neighborId` for the last selected id and replace the selection with that neighbor when it exists.
- `onSelectNode` is called with the last id's node, or `null`.

Do not pan on an unmodified left drag.

- [ ] **Step 1: Write failing select tests**

```ts
import { expect, test } from "vitest";
import { parseNukeScript } from "./parse.ts";
import { buildScene } from "./scene.ts";
import { neighborId, nodesInRect, toggleId, upstreamIds } from "./select.ts";

const measure = (line: string) => line.length * 6;
function sceneOf(source: string) {
  return buildScene(parseNukeScript(source), measure);
}

test("a rect includes a node it touches and skips one it misses", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 10
 ypos 20
}
`);
  const hit = nodesInRect(scene, { x: 10, y: 20, w: 1, h: 1 });
  expect(hit.map((node) => node.name)).toEqual(["Grade1"]);
  expect(nodesInRect(scene, { x: 0, y: 0, w: 9, h: 9 })).toEqual([]);
});

test("toggleId adds and then removes an id", () => {
  expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
  expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
});

test("upstreamIds walks through a dot once", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Dot {
 name Dot1
 xpos 34
 ypos 40
}
Grade {
 name Grade1
 xpos 0
 ypos 80
}
`);
  const grade = scene.nodes.find((node) => node.name === "Grade1")!;
  const names = upstreamIds(scene, grade.id).map((id) => scene.nodes.find((node) => node.id === id)?.name);
  expect(names).toEqual(["Grade1", "Dot1", "Constant1"]);
});

test("neighborId steps up to the input and down to the user", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 xpos 0
 ypos 40
}
`);
  const constant = scene.nodes.find((node) => node.name === "Constant1")!;
  const grade = scene.nodes.find((node) => node.name === "Grade1")!;
  expect(neighborId(scene, grade.id, "up")).toBe(constant.id);
  expect(neighborId(scene, constant.id, "down")).toBe(grade.id);
  expect(neighborId(scene, constant.id, "up")).toBeNull();
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm exec vitest run src/nuke/select.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement select helpers, renderer set, and NukeDag pointer/keys**

Keep the orange outline `[0.98, 0.6, 0, 1]` and draw it for every selected id. Update the geometry selection test so two selected ids produce two outlines and an unselected third node does not.

Update the Sample story sentence to mention drag-to-select, Shift to add, Ctrl+A, and Alt-drag to pan.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm exec vitest run src/nuke/select.test.ts src/gpu/geometry.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/nuke/select.ts src/nuke/select.test.ts src/gpu/renderer.ts src/gpu/geometry.ts src/gpu/geometry.test.ts src/NukeDag.tsx src/NukeDag.stories.tsx
git commit -m "feat: rubber-band select nodes with Nuke hotkeys"
```

---

### Task 4: Minimap

**Files:**
- Create: `src/nuke/minimap.ts`
- Create: `src/nuke/minimap.test.ts`
- Modify: `src/NukeDag.tsx`

**Interfaces:**
- Consumes: `DagScene.bounds`, `DagScene.nodes`, camera `{ x, y, zoom }`, CSS viewport size.
- Produces:
  - `viewRect(camera, cssWidth, cssHeight): { x, y, w, h }` equals `{ x: camera.x, y: camera.y, w: cssWidth / zoom, h: cssHeight / zoom }`.
  - `needsMinimap(bounds, view, slack = 8): boolean` is true when any edge of `bounds` lies more than `slack` pixels outside `view`.
  - `minimapFrame(bounds, size = { w: 180, h: 120 }, pad = 8)` returns `{ scale, originX, originY, width, height }` that fits `bounds` inside `size` with `pad` pixels of margin, preserving aspect. `scale` is CSS pixels per DAG pixel.

The map is a `<canvas>` in the bottom-right, 12px from the edges, shown only when `needsMinimap` is true. It draws a `#3a3a3a` background, a 1px `#dddddd` border, each node as a filled rect in `node.color`, and the current view as a fill `rgba(186, 140, 140, 0.45)` with a 1px `#f0d0d0` stroke. Pointer-down and drag on the map set the camera so the DAG point under the cursor stays under the cursor (dragging pans). The map does not start a node marquee.

- [ ] **Step 1: Write failing minimap tests**

```ts
import { expect, test } from "vitest";
import { minimapFrame, needsMinimap, viewRect } from "./minimap.ts";

test("viewRect is the camera window in DAG pixels", () => {
  expect(viewRect({ x: 10, y: 20, zoom: 2 }, 400, 200)).toEqual({ x: 10, y: 20, w: 200, h: 100 });
});

test("the minimap hides when the graph sits inside the view", () => {
  const bounds = { x: 0, y: 0, w: 100, h: 50 };
  const view = { x: -10, y: -10, w: 130, h: 80 };
  expect(needsMinimap(bounds, view)).toBe(false);
  expect(needsMinimap(bounds, { x: 0, y: 0, w: 90, h: 50 })).toBe(true);
});

test("minimapFrame fits the wider axis inside the padded map", () => {
  const frame = minimapFrame({ x: 0, y: 0, w: 200, h: 50 }, { w: 180, h: 120 }, 8);
  expect(frame.scale).toBeCloseTo((180 - 16) / 200);
  expect(frame.width).toBe(180);
  expect(frame.height).toBe(120);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm exec vitest run src/nuke/minimap.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement the math and the canvas**

Redraw the minimap from a `useEffect` that depends on the scene, camera, and wrapper size. Camera updates from pan, zoom, and map drag must redraw it.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm exec vitest run src/nuke/minimap.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/nuke/minimap.ts src/nuke/minimap.test.ts src/NukeDag.tsx
git commit -m "feat: show a Nuke minimap when the graph leaves the view"
```
