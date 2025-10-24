import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reviewTitle, artist, isEditorial, criticNames, podcastScript } = req.body;

  if (!reviewTitle || !artist) {
    return res.status(400).json({ error: 'reviewTitle and artist required' });
  }

  if (!podcastScript) {
    return res.status(400).json({ error: 'podcastScript required for album art generation' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Format the script for context (limit to first 1500 chars to avoid token limits)
  const scriptPreview = typeof podcastScript === 'string'
    ? podcastScript.substring(0, 1500)
    : Array.isArray(podcastScript)
    ? podcastScript.map((line: any) => `${line.speaker}: ${line.line}`).join('\n').substring(0, 1500)
    : JSON.stringify(podcastScript).substring(0, 1500);

  try {
    // Step 1: Generate the album art prompt using Gemini text generation
    const promptGenerationRequest = isEditorial
      ? `Create a vivid, descriptive image generation prompt for podcast album art for "The Smudged Pamphlet" editorial roundtable podcast.

PODCAST DETAILS:
- Title: "${reviewTitle}"
- Subject: ${artist}
- Format: Editorial roundtable discussion
- Host: Chuck Morrison (Editor-in-Chief)
- Panelists: ${criticNames?.join(', ') || 'Various critics'}

PODCAST SCRIPT EXCERPT (first part of the conversation):
${scriptPreview}
[...continued]

STYLE REQUIREMENTS:
- Bold, newspaper-style aesthetic matching "The Smudged Pamphlet" brand
- Vintage/retro newspaper or magazine cover style
- High contrast, dramatic lighting
- Include visual elements that represent the subject matter
- Professional podcast album art suitable for audio players
- Square format (1:1 aspect ratio)

Based on the podcast conversation above, create a detailed, single-paragraph image generation prompt (150-200 words) that describes the scene, composition, style, lighting, and mood. The artwork should visually represent the themes, tone, and key topics discussed in the script. Focus on creating striking, memorable album art that captures the essence of this critical editorial discussion.

Return ONLY the image prompt, no additional commentary.`
      : `Create a vivid, descriptive image generation prompt for podcast album art for "The Smudged Pamphlet" podcast.

PODCAST DETAILS:
- Review Title: "${reviewTitle}"
- Subject/Artist: ${artist}
- Format: Discussion between Chuck Morrison (host) and the critic

PODCAST SCRIPT EXCERPT (first part of the conversation):
${scriptPreview}
[...continued]

STYLE REQUIREMENTS:
- Bold, newspaper-style aesthetic matching "The Smudged Pamphlet" brand
- Vintage/retro newspaper or magazine cover style
- High contrast, dramatic lighting
- Include visual elements that represent the subject matter discussed in the script
- Professional podcast album art suitable for audio players
- Square format (1:1 aspect ratio)

Based on the podcast conversation above, create a detailed, single-paragraph image generation prompt (150-200 words) that describes the scene, composition, style, lighting, and mood. The artwork should visually represent the themes, tone, and key topics discussed in the script.

Return ONLY the image prompt, no additional commentary.`;

    const promptResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptGenerationRequest }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 4096}
        })
      }
    );

    if (!promptResponse.ok) {
      throw new Error('Failed to generate album art prompt');
    }

    const promptData = await promptResponse.json();
    const imagePrompt = promptData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!imagePrompt) {
      throw new Error('No image prompt generated');
    }

    console.log('Generated album art prompt:', imagePrompt);

    // Step 2: Generate the image using Gemini image generation
    const imageResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }]
        })
      }
    );

    if (!imageResponse.ok) {
      const errorData = await imageResponse.json();
      console.error('Image generation error:', errorData);
      throw new Error('Failed to generate album art image');
    }

    const imageData = await imageResponse.json();

    // Image can be in any part - find the one with inlineData (REST API uses camelCase)
    const imagePart = imageData.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);

    if (!imagePart?.inlineData) {
      console.error('No image data in response');
      console.error('Full response:', JSON.stringify(imageData, null, 2));
      throw new Error('No image data in response');
    }

    const { data: base64Image, mimeType } = imagePart.inlineData;

    return res.status(200).json({
      imageData: base64Image,
      mimeType: mimeType || 'image/png',
      prompt: imagePrompt
    });

  } catch (error: any) {
    console.error('Album art generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate album art',
      details: error.message
    });
  }
}
