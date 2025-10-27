// Client-side API helpers for server-side routes

export interface YouTubeMetadata {
  title: string;
  channelTitle: string;
  description: string;
  categoryId: string;
  thumbnailUrl?: string;
}

export interface GeminiGenerateRequest {
  model: string;
  contents: any[];
  generationConfig?: any;
}

export interface GeminiGenerateResponse {
  candidates: any[];
  parts: any[];
}

/**
 * Fetch YouTube video metadata using server-side API
 */
export async function fetchYouTubeMetadataServerSide(videoId: string): Promise<YouTubeMetadata> {
  const response = await fetch('/api/youtube/metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch YouTube metadata');
  }

  return response.json();
}

/**
 * Check if payload is too large for standard API route (approaching Vercel 4.5MB limit)
 */
function isPayloadTooLarge(request: GeminiGenerateRequest): boolean {
  const jsonStr = JSON.stringify(request);
  const sizeBytes = new Blob([jsonStr]).size;
  const MAX_SAFE_SIZE = 3.5 * 1024 * 1024; // 3.5MB to leave headroom
  return sizeBytes > MAX_SAFE_SIZE;
}

/**
 * Extract media file from request contents
 */
function extractMediaFromContents(request: GeminiGenerateRequest): {
  hasMedia: boolean;
  mediaData?: string;
  mimeType?: string;
  promptText?: string;
} {
  const firstContent = request.contents[0];
  if (!firstContent?.parts) {
    return { hasMedia: false };
  }

  let textPart: string | undefined;
  let mediaPart: any;

  for (const part of firstContent.parts) {
    if (part.text) {
      textPart = part.text;
    } else if (part.inlineData) {
      mediaPart = part.inlineData;
    }
  }

  if (mediaPart) {
    return {
      hasMedia: true,
      mediaData: mediaPart.data,
      mimeType: mediaPart.mimeType,
      promptText: textPart,
    };
  }

  return { hasMedia: false, promptText: textPart };
}

/**
 * Generate content using Gemini via server-side API
 * Automatically uses file upload endpoint for large payloads
 */
export async function generateContentServerSide(
  request: GeminiGenerateRequest
): Promise<GeminiGenerateResponse> {
  // Check if we're in a browser environment with large payload
  const isVercel = typeof window !== 'undefined' &&
    (window.location.hostname.includes('vercel.app') ||
     window.location.hostname.includes('vercel.live'));
  // Also include smudgedpamphlet.com as "Vercel"-like for asset upload support
  const isSmudgedPamphlet = typeof window !== 'undefined' &&
    window.location.hostname.includes('smudgedpamphlet.com');
  const isVercelOrPamphlet = isVercel || isSmudgedPamphlet;

  const isTooLarge = isPayloadTooLarge(request);

  // Use file upload endpoint for large payloads in Vercel
  if (isVercel && isTooLarge) {
    const { hasMedia, mediaData, mimeType, promptText } = extractMediaFromContents(request);

    if (hasMedia && mediaData && mimeType && promptText) {
      // Convert base64 to Blob for file upload
      const binaryString = atob(mediaData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });

      // Use FormData for file upload
      const formData = new FormData();
      formData.append('model', request.model);
      formData.append('prompt', promptText);
      formData.append('media', blob, 'media-file');
      formData.append('mimeType', mimeType);
      if (request.generationConfig) {
        formData.append('generationConfig', JSON.stringify(request.generationConfig));
      }

      const response = await fetch('/api/review/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate content');
      }

      return response.json();
    }
  }

  // Standard JSON API route for smaller payloads or non-Vercel
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate content');
  }

  return response.json();
}

/**
 * Extract YouTube video ID from URL
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^&\s]+)/,
    /youtube\.com\/v\/([^&\s]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Server-side GoogleGenerativeAI wrapper
 * Mimics the GoogleGenerativeAI API but calls our server-side endpoint
 */
export class ServerSideGeminiAI {
  constructor() {
    // No API key needed - handled server-side
  }

  getGenerativeModel(config: { model: string; generationConfig?: any }) {
    return {
      generateContent: async (request: { contents: any[]; generationConfig?: any } | string | any[]) => {
        // Handle different input formats
        let contents: any[];
        let generationConfig: any;

        if (Array.isArray(request)) {
          // Shorthand: array of parts that need wrapping
          // Convert string parts to proper format
          const parts = request.map((item: any) => {
            if (typeof item === 'string') {
              return { text: item };
            }
            return item;
          });
          contents = [{ role: 'user', parts }];
          generationConfig = config.generationConfig;
        } else if (typeof request === 'object' && 'contents' in request) {
          // Full format with contents and generationConfig
          contents = request.contents;
          generationConfig = request.generationConfig || config.generationConfig;
        } else {
          // Fallback - single item
          const part = typeof request === 'string' ? { text: request } : request;
          contents = [{ role: 'user', parts: [part] }];
          generationConfig = config.generationConfig;
        }

        const apiResponse = await generateContentServerSide({
          model: config.model,
          contents,
          generationConfig,
        });

        // Return in the same format as GoogleGenerativeAI
        return {
          response: {
            candidates: apiResponse.candidates,
            text: () => {
              // Extract text from first candidate
              const parts = apiResponse.candidates?.[0]?.content?.parts || [];
              return parts.map((p: any) => p.text).join('');
            },
          },
        };
      },
    };
  }
}
