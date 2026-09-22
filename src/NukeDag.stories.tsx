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
      <div style={{ height: "100vh", background: "#3c3c3c" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NukeDag>;

export default meta;

type Story = StoryObj<typeof meta>;

const shapes = `version 17.0 v3
Camera3 {
 inputs 0
 name Camera1
 xpos 0
 ypos 0
}
Light2 {
 inputs 0
 name Light1
 xpos 120
 ypos 0
}
Scene {
 inputs 0
 name Scene1
 xpos 240
 ypos 0
}
GeoCard {
 inputs 0
 name GeoCard1
 xpos 0
 ypos 120
}
ReadGeo2 {
 inputs 0
 name ReadGeo1
 xpos 160
 ypos 120
}
DeepRead {
 inputs 0
 name DeepRead1
 xpos 0
 ypos 200
}
DeepMerge {
 inputs 0
 name DeepMerge1
 xpos 180
 ypos 280
}
BasicMaterial {
 inputs 0
 name BasicMaterial1
 xpos 360
 ypos 120
}
Viewer {
 inputs 0
 name Viewer1
 xpos 360
 ypos 200
}
ParticleEmitter {
 inputs 0
 name ParticleEmitter1
 xpos 360
 ypos 280
}
Blur {
 inputs 0
 name Blur1
 xpos 180
 ypos 360
}
`;

export const Shapes: Story = {
  args: { script: shapes },
};

export const Sample: Story = {
  args: { script: SAMPLE_SCRIPT },
  parameters: {
    docs: {
      description: {
        story:
          "Paste a .nk or .gizmo to replace the graph. Middle-drag or Alt-drag pans. The scroll wheel, +/-, or Alt+middle-drag zooms around the cursor. F or a middle-click frames the selection, or the whole graph when nothing is selected. Drag to select nodes, Shift to add, Ctrl+A to select every node. Double-click a group or gizmo, or select it and press Ctrl+Enter (Cmd+Return on Mac). Esc steps back out. Requires WebGPU.",
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
