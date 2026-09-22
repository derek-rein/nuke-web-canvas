import type { Meta, StoryObj } from "@storybook/react-vite";
import { NukeDag } from "./NukeDag.tsx";
import { SAMPLE_SCRIPT } from "./nuke/sample.ts";

const chain = `version 15.1 v1
Read {
 inputs 0
 file /plates/hero.1001.exr
 name Read1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 xpos 0
 ypos 70
}
Blur {
 size 4
 name Blur1
 xpos 0
 ypos 140
}
Write {
 file /comp/hero.####.exr
 name Write1
 xpos 0
 ypos 210
}
`;

const meta = {
  title: "Nuke/NukeDag",
  component: NukeDag,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "#1c1c1c" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NukeDag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sample: Story = {
  args: { script: SAMPLE_SCRIPT },
  parameters: {
    docs: {
      description: {
        story:
          "Drag to pan, scroll or +/- to zoom, and press F to fit the selection or the whole graph. Double-click a group or gizmo, or select it and press Ctrl+Enter (Cmd+Return on Mac). Esc steps back out. Requires WebGPU.",
      },
    },
  },
};

const gizmo = `Gizmo {
 name Glow_Exponential
 inputs 1
 tile_color 0xc97200ff
 xpos 0
 ypos 0
}
 Input {
  inputs 0
  name img
  xpos 0
  ypos -40
 }
 Blur {
  size 10
  name Blur1
  xpos 0
  ypos 40
 }
 Output {
  name Output1
  xpos 0
  ypos 120
 }
end_group
`;

export const Gizmo: Story = {
  args: { script: gizmo },
  parameters: {
    docs: {
      description: {
        story: "A .gizmo file. Select Glow_Exponential and press Ctrl+Enter to read the nodes inside it.",
      },
    },
  },
};

export const Chain: Story = {
  args: { script: chain },
};

export const UnclosedScript: Story = {
  args: {
    script: `Read {
 name Read1
`,
  },
};
