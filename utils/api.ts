// Client-side API helpers for server-side routes

export interface YouTubeMetadata {
  title: string;
  channelTitle: string;
  description: string;
  categoryId: string;
  isMusic: boolean;
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
 * Generate content using Gemini via server-side API
 */
export async function generateContentServerSide(
  request: GeminiGenerateRequest
): Promise<GeminiGenerateResponse> {
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
