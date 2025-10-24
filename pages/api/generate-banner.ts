import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, artist, reviewText, isEditorial, criticNames } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title required' });
  }

  if (!reviewText) {
    return res.status(400).json({ error: 'reviewText required for banner generation' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Format the review text for context (limit to first 2000 chars to avoid token limits)
  const reviewPreview = typeof reviewText === 'string'
    ? reviewText.substring(0, 2000)
    : Array.isArray(reviewText)
    ? reviewText.join('\n\n').substring(0, 2000)
    : JSON.stringify(reviewText).substring(0, 2000);

  try {
    // Step 1: Generate the banner image prompt using Gemini text generation
    const promptGenerationRequest = isEditorial
      ? `Create a vivid, descriptive image generation prompt for a banner image for "The Smudged Pamphlet" editorial.

EDITORIAL DETAILS:
- Title: "${title}"
- Subject: ${artist || 'Various topics'}
- Format: Editorial roundtable discussion
- Critics: ${criticNames?.join(', ') || 'Various critics'}

EDITORIAL TEXT EXCERPT:
${reviewPreview}
[...continued]

STYLE REQUIREMENTS:
- Bold, newspaper-style aesthetic matching "The Smudged Pamphlet" brand
- Vintage/retro newspaper or magazine header/masthead style
- High contrast, dramatic lighting
- Include visual elements that represent the editorial's themes and topics
- Professional banner image suitable for web display
- Wide horizontal format (16:9 or similar aspect ratio)
- Cinematic, eye-catching composition
- Should feel like a classic newspaper front page or magazine cover

Based on the editorial text above, create a detailed, single-paragraph image generation prompt (150-200 words) that describes the scene, composition, style, lighting, and mood. The banner should visually represent the themes, tone, and key topics discussed in the editorial. Focus on creating a striking, memorable banner that captures the essence of this critical discussion.

Return ONLY the image prompt, no additional commentary.`
      : `Create a vivid, descriptive image generation prompt for a banner image for "The Smudged Pamphlet" review.

REVIEW DETAILS:
- Title: "${title}"
- Subject/Artist: ${artist || 'Unknown'}

REVIEW TEXT EXCERPT:
${reviewPreview}
[...continued]

STYLE REQUIREMENTS:
- Bold, newspaper-style aesthetic matching "The Smudged Pamphlet" brand
- Vintage/retro newspaper or magazine header/masthead style
- High contrast, dramatic lighting
- Include visual elements that represent the work being reviewed
- Professional banner image suitable for web display
- Wide horizontal format (16:9 or similar aspect ratio)
- Cinematic, eye-catching composition
- Should feel like a classic newspaper front page or magazine cover

Based on the review text above, create a detailed, single-paragraph image generation prompt (150-200 words) that describes the scene, composition, style, lighting, and mood. The banner should visually represent the themes, tone, and subject matter of the review. Focus on creating a striking, memorable banner that captures the essence of this critical review.

Return ONLY the image prompt, no additional commentary.`;

    const promptResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptGenerationRequest }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!promptResponse.ok) {
      const errorText = await promptResponse.text();
      console.error('Prompt generation failed:', errorText);
      return res.status(500).json({ error: 'Failed to generate image prompt' });
    }

    const promptData = await promptResponse.json();
    const imagePrompt = promptData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!imagePrompt) {
      console.error('No prompt generated');
      return res.status(500).json({ error: 'No prompt generated' });
    }

    console.log('Generated banner image prompt:', imagePrompt.substring(0, 200) + '...');

    // Step 2: Generate the actual image using Gemini image generation
    const imageResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('Image generation failed:', errorText);
      return res.status(500).json({ error: 'Failed to generate banner image' });
    }

    const imageData = await imageResponse.json();

    // Image can be in any part - find the one with inlineData
    const imagePart = imageData.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);

    if (!imagePart?.inlineData) {
      console.error('No image data in response');
      console.error('Full response:', JSON.stringify(imageData, null, 2));
      return res.status(500).json({ error: 'No image generated' });
    }

    const { data: base64Image, mimeType } = imagePart.inlineData;

    console.log('Banner image generated successfully');

    return res.status(200).json({
      imageData: base64Image,
      mimeType: mimeType || 'image/png',
    });
  } catch (error) {
    console.error('Banner generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate banner image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
