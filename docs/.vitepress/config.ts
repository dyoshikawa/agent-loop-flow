import { defineConfig } from "vitepress";

export default defineConfig({
  title: "agent-loop-flow",
  description:
    "AI coding agent utility CLI that orchestrates skill flows with transitions and loops",
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Flow Definition", link: "/flow-definition" },
      { text: "CLI Reference", link: "/cli-reference" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Flow Definition", link: "/flow-definition" },
          { text: "CLI Reference", link: "/cli-reference" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/dyoshikawa-claw/agent-loop-flow",
      },
    ],
  },
});
