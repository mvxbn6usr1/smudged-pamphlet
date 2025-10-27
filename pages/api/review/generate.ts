import type { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser to use formidable
  },
};

/**
 * Server-side review generation endpoint
 * Accepts file uploads directly and processes them without hitting payload limits
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFieldsSize: 10 * 1024 * 1024, // 10MB for text fields
    });

    const [fields, files] = await form.parse(req);

    // Extract fields
    const model = fields.model?.[0];
    const prompt = fields.prompt?.[0];
    const generationConfig = fields.generationConfig?.[0]
      ? JSON.parse(fields.generationConfig[0])
      : undefined;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt required' });
    }

    // Get uploaded file (if any)
    const uploadedFile = files.media?.[0];
    const mimeType = fields.mimeType?.[0];

    // Build Gemini request
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const geminiModel = genAI.getGenerativeModel({ model });

    const parts: any[] = [{ text: prompt }];

    // Add media file if provided
    if (uploadedFile && mimeType) {
      const fileData = await fs.readFile(uploadedFile.filepath);
      const base64Data = fileData.toString('base64');

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType,
        },
      });

      // Clean up temp file
      await fs.unlink(uploadedFile.filepath);
    }

    // Call Gemini
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
    });

    const response = await result.response;
    const responseText = response.text();

    return res.status(200).json({
      candidates: response.candidates,
      text: responseText,
      parts: response.candidates?.[0]?.content?.parts || [],
    });
  } catch (error: any) {
    console.error('Review generation error:', error);

    const statusCode = error.status || 500;
    const errorMessage = error.message || 'Failed to generate review';

    return res.status(statusCode).json({
      error: errorMessage,
      isOverloaded: statusCode === 503,
    });
  }
}
