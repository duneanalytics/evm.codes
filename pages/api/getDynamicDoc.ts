import { NextApiResponse, NextApiRequest } from 'next'
import { serialize } from 'next-mdx-remote/serialize'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { body } = req
  return res.status(200).json({ mdx: await serialize(body.content) })
}
