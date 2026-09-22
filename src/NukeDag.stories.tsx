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
          "A small comp. Scroll to zoom, drag to pan, press F to fit, and double-click grade_group to open it. Requires WebGPU.",
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
