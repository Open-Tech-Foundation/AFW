import createMDX from "@next/mdx";

// Turbopack needs serializable MDX options: plugins named as strings.
const withMDX = createMDX({ options: { remarkPlugins: ["remark-gfm"] } });
export default withMDX({ pageExtensions: ["js", "jsx", "md", "mdx"] });
