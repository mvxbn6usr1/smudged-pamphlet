import type { NextApiRequest, NextApiResponse } from 'next';

interface GenerateTitleRequest {
  script: string | any[]; // Podcast script (can be array of segments or flat array)
  summary?: string; // Editorial summary
  verdicts?: Array<{
    mediaTitle: string;
    mediaArtist: string;
    verdict: 'ROCKS' | 'SUCKS';
  }>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { script, summary, verdicts } = req.body as GenerateTitleRequest;

    if (!script) {
      return res.status(400).json({ error: 'Missing script' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Extract text from script (handle both segmented and flat formats)
    let scriptText = '';
    if (Array.isArray(script)) {
      if (script.length > 0 && 'script' in script[0]) {
        // Segmented format
        scriptText = script.map((seg: any) =>
          seg.script.map((line: any) => `${line.speaker}: ${line.line}`).join('\n')
        ).join('\n\n');
      } else {
        // Flat format
        scriptText = script.map((line: any) => `${line.speaker}: ${line.line}`).join('\n');
      }
    }

    // Build context for title generation
    let context = '';
    if (verdicts && verdicts.length > 0) {
      context += '\n\nMedia discussed:\n';
      verdicts.forEach(v => {
        context += `- "${v.mediaTitle}" by ${v.mediaArtist} (${v.verdict})\n`;
      });
    }
    if (summary) {
      context += `\n\nEditorial summary: ${summary}\n`;
    }

    const prompt = `Generate a short, catchy title for this editorial podcast discussion. The title should be 4-6 words that capture the main theme or debate.

${context}

Podcast script excerpt:
${scriptText.substring(0, 2000)}

Requirements:
- 4-6 words only
- Catchy and engaging
- Reflects the main discussion topic
- NO quotation marks
- NO generic phrases like "Editorial Discussion" or "Roundtable"
- Focus on the actual topic being debated

Return ONLY the title, nothing else.`;

    console.log('Generating editorial podcast title...');

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 50,
          }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return res.status(geminiResponse.status).json({
        error: 'Failed to generate title',
        details: errorText,
      });
    }

    const data = await geminiResponse.json();
    const generatedTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!generatedTitle) {
      return res.status(500).json({ error: 'No title generated' });
    }

    // Clean up the title (remove quotes, extra whitespace, etc.)
    const cleanTitle = generatedTitle
      .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    console.log('Generated editorial title:', cleanTitle);

    res.status(200).json({
      title: cleanTitle,
    });

  } catch (error) {
    console.error('Error generating editorial title:', error);
    res.status(500).json({
      error: 'Failed to generate title',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
