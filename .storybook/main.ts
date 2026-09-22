import type { StorybookConfig } from "@storybook/react-vite";
import typegpu from "unplugin-typegpu/vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), typegpu({})];
    if (process.env.GITHUB_PAGES === "true") {
      config.base = "/nuke-web-canvas/";
    }
    return config;
  },
};

export default config;
