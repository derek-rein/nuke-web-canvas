import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NukeDag } from "./NukeDag.tsx";
import { SAMPLE_SCRIPT } from "./nuke/sample.ts";
import { NST_COMMIT, loadNstGraph } from "./stories/nst/toolkit.ts";

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
  argTypes: {
    showProperties: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <div style={{ height: "100vh", background: "#3c3c3c" }}>
        <Story args={{ ...context.args, showProperties: context.globals.properties !== "off" }} />
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
  args: { script: SAMPLE_SCRIPT, showProperties: true },
  parameters: {
    docs: {
      description: {
        story:
          "Paste a .nk or .gizmo to replace the graph. Middle-drag or Alt-drag pans. Drag with one finger on a phone. The scroll wheel, pinch, +/-, or Alt+middle-drag zooms around the cursor. F or a middle-click frames the selection, or the whole graph when nothing is selected. Drag to select nodes, Shift to add, Ctrl+A to select every node. Double-click a group or gizmo, or select it and press Ctrl+Enter (Cmd+Return on Mac). Esc steps back out. The Properties toolbar button shows or hides the read-only properties pane. WebGPU is used when the browser has it; phones draw with canvas 2D.",
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

const toolkit = `Inside of a gizmo from Tony Lyons' Nuke Survival Toolkit, loaded from GitHub at ${NST_COMMIT} rather than copied into this repo. The graph is the tool itself, not the closed group. https://github.com/CreativeLyons/NukeSurvivalToolkit_publicRelease`;

function ToolkitGraph(props: { file: string; showProperties?: boolean }) {
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setScript(null);
    setError(null);
    loadNstGraph(props.file).then(
      (text) => {
        if (live) setScript(text);
      },
      (reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Could not load the gizmo");
      },
    );
    return () => {
      live = false;
    };
  }, [props.file]);
  if (error) return <p style={{ color: "#ddd", font: "12px Verdana, sans-serif", margin: 16 }}>{error}</p>;
  if (!script) return <p style={{ color: "#ddd", font: "12px Verdana, sans-serif", margin: 16 }}>Loading {props.file}…</p>;
  return <NukeDag script={script} showProperties={props.showProperties ?? true} />;
}

export const ExponentialGlow: Story = {
  args: { script: "", showProperties: true },
  render: (args) => <ToolkitGraph file="NST_Glow_Exponential.gizmo" showProperties={args.showProperties} />,
  parameters: {
    docs: {
      description: {
        story: `SPIN VFX Glow_Exponential, the stacked blurs that fall off. ${toolkit}`,
      },
    },
  },
};

export const ExponGlow: Story = {
  args: { script: "", showProperties: true },
  render: (args) => <ToolkitGraph file="NST_ExponGlow.gizmo" showProperties={args.showProperties} />,
  parameters: {
    docs: {
      description: {
        story: `Tony Lyons' ExponGlow. ${toolkit}`,
      },
    },
  },
};

export const Halation: Story = {
  args: { script: "", showProperties: true },
  render: (args) => <ToolkitGraph file="NST_Halation.gizmo" showProperties={args.showProperties} />,
  parameters: {
    docs: {
      description: {
        story: `Tony Lyons' Halation. ${toolkit}`,
      },
    },
  },
};

export const Glass: Story = {
  args: { script: "", showProperties: true },
  render: (args) => <ToolkitGraph file="NST_Glass.gizmo" showProperties={args.showProperties} />,
  parameters: {
    docs: {
      description: {
        story: `Glass, with IDistort and a defocus. ${toolkit}`,
      },
    },
  },
};

export const HeatWave: Story = {
  args: { script: "", showProperties: true },
  render: (args) => <ToolkitGraph file="NST_HeatWave.gizmo" showProperties={args.showProperties} />,
  parameters: {
    docs: {
      description: {
        story: `HeatWave, a dense STMap distortion. ${toolkit}`,
      },
    },
  },
};

export const UnclosedScript: Story = {
  args: {
    script: `Read {
 name Read1
`,
  },
};
