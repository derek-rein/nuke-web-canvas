import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      options: {
        dag: { name: "dag", value: "#1c1c1c" },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "dag" },
  },
};

export default preview;
