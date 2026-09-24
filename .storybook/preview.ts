import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      options: {
        dag: { name: "dag", value: "#3c3c3c" },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "dag" },
    properties: "on",
  },
  globalTypes: {
    properties: {
      description: "Show or hide the properties panel",
      toolbar: {
        title: "Properties",
        icon: "sidebaralt",
        items: [
          { value: "on", icon: "sidebaralt", title: "Properties on" },
          { value: "off", icon: "cross", title: "Properties off" },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
