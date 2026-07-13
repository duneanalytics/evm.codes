import { NextApiResponse, NextApiRequest } from 'next'

import { etherscanGetSource } from '../../util/EtherscanApi'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const addr = req.query?.address as string
  const ethscan_resp = await etherscanGetSource(addr)
  const data = await ethscan_resp.json()
  return res.status(200).json(data)
}
