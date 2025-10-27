/**
 * Media storage utilities for handling large files
 * Uses Vercel Blob in production, direct data in development
 */

import { put } from '@vercel/blob';

const IS_VERCEL = process.env.VERCEL === '1' || process.env.NEXT_PUBLIC_VERCEL_ENV;
const MAX_INLINE_SIZE = 3 * 1024 * 1024; // 3MB - leave headroom under 4.5MB limit

export interface MediaReference {
  type: 'inline' | 'blob';
  data?: string; // base64 data for inline
  url?: string; // blob URL for blob storage
  mimeType: string;
}

/**
 * Upload media to appropriate storage based on environment and size
 */
export async function uploadMediaIfNeeded(
  data: string, // base64 data with or without data URL prefix
  mimeType: string,
  filename: string
): Promise<MediaReference> {
  // Remove data URL prefix if present
  const base64Data = data.includes(',') ? data.split(',')[1] : data;

  // Calculate size
  const sizeBytes = (base64Data.length * 3) / 4;

  // If small enough or not in Vercel, use inline
  if (!IS_VERCEL || sizeBytes < MAX_INLINE_SIZE) {
    return {
      type: 'inline',
      data: base64Data,
      mimeType,
    };
  }

  // Upload to Vercel Blob
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: mimeType,
    });

    return {
      type: 'blob',
      url: blob.url,
      mimeType,
    };
  } catch (error) {
    console.error('Failed to upload to Vercel Blob, falling back to inline:', error);
    // Fallback to inline even if large - may cause issues but better than failing
    return {
      type: 'inline',
      data: base64Data,
      mimeType,
    };
  }
}

/**
 * Download media from blob storage if needed, return base64 data
 */
export async function downloadMediaIfNeeded(ref: MediaReference): Promise<string> {
  if (ref.type === 'inline') {
    return ref.data!;
  }

  // Download from blob
  try {
    const response = await fetch(ref.url!);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return base64;
  } catch (error) {
    console.error('Failed to download from Vercel Blob:', error);
    throw new Error('Failed to retrieve media file');
  }
}

/**
 * Convert MediaReference to Gemini API format
 */
export function mediaReferenceToGeminiPart(ref: MediaReference): any {
  if (ref.type === 'inline') {
    return {
      inlineData: {
        data: ref.data,
        mimeType: ref.mimeType,
      },
    };
  }

  // For blob storage, we need to download it first
  // This should be called from server-side code
  throw new Error('Blob references must be downloaded before sending to Gemini');
}
