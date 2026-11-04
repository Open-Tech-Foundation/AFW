// The shared input of the full-stack benchmark: product data, docs pages and the
// generated route pages, identical for every framework. Deterministic, so every app
// builds the same content on every run.

const ADJECTIVES = ["Swift", "Quiet", "Bright", "Solid", "Nimble", "Bold", "Calm", "Sharp", "Plain", "Rapid"];
const NOUNS = ["Lamp", "Chair", "Kettle", "Desk", "Shelf", "Clock", "Mug", "Rug", "Fan", "Stool"];

/** 50 products: `{ id, name, price, description }`. */
export function products() {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `${ADJECTIVES[i % 10]} ${NOUNS[Math.floor(i / 5) % 10]} ${i + 1}`,
    price: 10 + ((i * 37) % 90),
    description: `Product ${i + 1}: a ${ADJECTIVES[i % 10].toLowerCase()} ${NOUNS[Math.floor(i / 5) % 10].toLowerCase()} for every room.`,
  }));
}

export const DOC_SLUGS = [
  "getting-started", "installation", "routing", "data", "components",
  "styling", "testing", "deployment", "configuration", "faq",
];

/** 10 MDX docs pages: headings, lists, a GFM table and a code block each — plain Markdown, so every MDX pipeline renders them the same. */
export function docs() {
  return DOC_SLUGS.map((slug, n) => {
    const title = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    const sections = Array.from({ length: 4 }, (_, s) => `## ${title} section ${s + 1}

This section of the ${title.toLowerCase()} guide explains step ${s + 1} in a few sentences, so the page has
real paragraphs to parse and render. It links to [the next section](#${slug}-section-${s + 2}).

- First point about ${slug} ${s + 1}
- Second point, with \`inline code\`
- Third point, with **emphasis**

| Option | Default | Meaning |
| --- | --- | --- |
| \`mode\` | \`"spa"\` | How pages render (${n}-${s}) |
| \`port\` | \`3000\` | Where the server listens |
| \`debug\` | \`false\` | Verbose logs |

\`\`\`js
export function example${s + 1}() {
  const values = [${n}, ${s}, ${n + s}];
  return values.map((value) => value * 2);
}
\`\`\`
`).join("\n");
    return { slug, title, mdx: `# ${title}\n\nThe ${title.toLowerCase()} page of the benchmark docs.\n\n${sections}` };
  });
}

/** The edit the dev benchmark makes: the counter's label. */
export const HMR_EDIT = { from: "Count:", to: "Clicks:" };
