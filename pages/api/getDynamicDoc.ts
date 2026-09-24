import { NextApiResponse, NextApiRequest } from 'next'

import { serializeDoc } from 'util/mdx'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { body } = req
    res.status(200).json({ mdx: await serializeDoc(body.content) })
  } else {
    res.status(405)
  }
}
