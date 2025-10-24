import type { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Rate limiting: simple in-memory store
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = 50; // requests per window (lower for expensive AI calls)
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 10000; // Maximum entries before cleanup

function cleanupExpiredEntries() {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(ip);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Rate Limit] Cleaned up ${cleanedCount} expired entries`);
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  // Cleanup if map grows too large
  if (requestCounts.size > MAX_ENTRIES) {
    cleanupExpiredEntries();
    // If still too large after cleanup, clear all
    if (requestCounts.size > MAX_ENTRIES) {
      console.warn('[Rate Limit] Map size exceeded maximum, clearing all entries');
      requestCounts.clear();
    }
  }

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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb', // Allow larger payloads for editorial generation with multiple media files
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

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipString = Array.isArray(ip) ? ip[0] : ip;

  if (!checkRateLimit(ipString)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  const { model, contents, generationConfig } = req.body;

  if (!model || !contents) {
    return res.status(400).json({ error: 'model and contents required' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Validate API key format (Google API keys start with 'AIza')
  if (!GEMINI_API_KEY.startsWith('AIza')) {
    console.error('GEMINI_API_KEY appears to be invalid format');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const geminiModel = genAI.getGenerativeModel({ model });

    const result = await geminiModel.generateContent({
      contents,
      generationConfig,
    });

    const response = await result.response;

    // Extract all parts from response
    const parts = response.candidates?.[0]?.content?.parts || [];

    return res.status(200).json({
      candidates: response.candidates,
      parts: parts,
    });
  } catch (error: any) {
    console.error('Gemini API error:', error);

    // Forward the actual error status from Google API if available
    const statusCode = error.status || 500;
    const errorMessage = error.message || 'Failed to generate content';

    return res.status(statusCode).json({
      error: errorMessage,
      isOverloaded: statusCode === 503
    });
  }
}
