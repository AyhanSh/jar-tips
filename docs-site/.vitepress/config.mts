import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// Served by the app's Vercel deployment at /docs/ (see ../../vercel.json).
// Override with DOCS_BASE=/ to host the docs on their own.
const base = process.env.DOCS_BASE ?? "/docs/";

export const REPO = "https://github.com/AyhanSh/jar-tips";

export default withMermaid(
  defineConfig({
    base,
    title: "Jar docs",
    description: "Technical documentation for Jar: restaurant tips held and split by a Solana program, with no owner in the loop.",
    lang: "en-US",
    lastUpdated: true,
    head: [
      ["link", { rel: "icon", type: "image/png", href: `${base}jar.png` }],
      ["meta", { name: "theme-color", content: "#3ecf8e" }],
    ],
    markdown: {
      lineNumbers: false,
    },
    // Mermaid ships CommonJS deps that the dev server must pre-bundle.
    vite: {
      optimizeDeps: { include: ["mermaid", "fastdom", "dayjs", "debug", "@braintree/sanitize-url", "cytoscape", "cytoscape-cose-bilkent"] },
    },
    themeConfig: {
      logo: "/jar.png",
      siteTitle: "Jar docs",
      nav: [
        { text: "For judges", link: "/guide/judges" },
        { text: "Program", link: "/program/overview" },
        { text: "Security", link: "/security/threat-model" },
        { text: "Live app", link: "https://jar-tips.vercel.app" },
      ],
      sidebar: [
        {
          text: "Start here",
          items: [
            { text: "Review in 10 minutes", link: "/guide/judges" },
            { text: "The problem and the design", link: "/guide/why" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Lifecycle of a shift", link: "/guide/lifecycle" },
          ],
        },
        {
          text: "On-chain program",
          items: [
            { text: "Overview", link: "/program/overview" },
            { text: "Accounts and PDAs", link: "/program/accounts" },
            { text: "Instructions", link: "/program/instructions" },
            { text: "settle(): where the middleman disappears", link: "/program/settle" },
            { text: "Split and majority maths", link: "/program/maths" },
            { text: "Errors and events", link: "/program/errors-events" },
          ],
        },
        {
          text: "Security",
          items: [
            { text: "Threat model", link: "/security/threat-model" },
            { text: "Failure modes", link: "/security/failure-modes" },
            { text: "Verify it yourself", link: "/security/verify" },
            { text: "Honest limitations", link: "/security/limitations" },
          ],
        },
        {
          text: "Web app",
          items: [
            { text: "Client architecture", link: "/client/architecture" },
            { text: "Sending transactions", link: "/client/transactions" },
            { text: "Run and deploy", link: "/client/run" },
          ],
        },
      ],
      socialLinks: [{ icon: "github", link: REPO }],
      editLink: {
        pattern: `${REPO}/edit/main/docs-site/:path`,
        text: "Edit this page on GitHub",
      },
      search: { provider: "local" },
      outline: { level: [2, 3] },
      footer: {
        message: "Superteam Poland · Finance Without Intermediaries · built with VitePress (MIT)",
        copyright: "Program HrFcxm1y…ZSD on Solana devnet",
      },
    },
    mermaid: {
      theme: "neutral",
    },
  }),
);
