import type { NextApiRequest, NextApiResponse } from 'next';
import { put } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, mimeType, filename } = req.body;

  if (!data || !mimeType || !filename) {
    return res.status(400).json({ error: 'data, mimeType, and filename required' });
  }

  try {
    // Check if we're in Vercel environment with Blob storage available
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

    if (!isVercel || !process.env.BLOB_READ_WRITE_TOKEN) {
      // Not in Vercel or no blob storage - return inline reference
      return res.status(200).json({
        type: 'inline',
        data,
        mimeType,
      });
    }

    // Upload to Vercel Blob
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return res.status(200).json({
      type: 'blob',
      url: blob.url,
      mimeType,
    });
  } catch (error: any) {
    console.error('Media upload error:', error);

    // Fallback to inline if blob upload fails
    return res.status(200).json({
      type: 'inline',
      data,
      mimeType,
    });
  }
}
