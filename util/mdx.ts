import { serialize } from 'next-mdx-remote/serialize'
import remarkGfm from 'remark-gfm'

// MDX 2+ no longer bundles GFM; the docs rely on its tables.
export const serializeDoc = (content: string) =>
  serialize(content, { mdxOptions: { remarkPlugins: [remarkGfm] } })
