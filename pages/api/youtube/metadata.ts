import type { NextApiRequest, NextApiResponse } from 'next';

// Rate limiting: simple in-memory store (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipString = Array.isArray(ip) ? ip[0] : ip;

  if (!checkRateLimit(ipString)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    console.error('YOUTUBE_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Use YouTube Data API v3 to get video details
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = data.items[0];
    const snippet = video.snippet;

    // Return metadata only - classification happens client-side with full logging
    return res.status(200).json({
      title: snippet.title,
      channelTitle: snippet.channelTitle,
      description: snippet.description,
      categoryId: snippet.categoryId,
      thumbnailUrl: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
    });
  } catch (error: any) {
    console.error('YouTube API error:', error);
    return res.status(500).json({ error: 'Failed to fetch video metadata' });
  }
}
