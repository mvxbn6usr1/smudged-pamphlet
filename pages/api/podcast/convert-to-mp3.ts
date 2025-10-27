import type { NextApiRequest, NextApiResponse } from 'next';
// @ts-ignore - no types available
import lamejs from 'lamejs';
import { ID3Writer } from 'browser-id3-writer';
import sharp from 'sharp';

interface ConvertToMP3Request {
  wavDataUrl: string; // WAV audio as data URL
  albumArt?: {
    imageData: string; // base64 image data
    mimeType: string;
  };
  title: string;
  artist?: string; // defaults to "The Smudged Pamphlet"
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Handle large audio files
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

  try {
    const { wavDataUrl, albumArt, title, artist = 'The Smudged Pamphlet' } = req.body as ConvertToMP3Request;

    if (!wavDataUrl || !title) {
      return res.status(400).json({ error: 'Missing required fields: wavDataUrl, title' });
    }

    // Extract base64 data from data URL
    const base64Data = wavDataUrl.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({ error: 'Invalid data URL format' });
    }

    // Convert base64 to buffer
    const wavBuffer = Buffer.from(base64Data, 'base64');

    // Parse WAV header to get audio parameters
    // WAV header format: https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
    const sampleRate = wavBuffer.readUInt32LE(24);
    const numChannels = wavBuffer.readUInt16LE(22);
    const bitsPerSample = wavBuffer.readUInt16LE(34);

    console.log('WAV params:', { sampleRate, numChannels, bitsPerSample });

    // Find the data chunk (skip over headers)
    let dataOffset = 12; // Skip RIFF header
    while (dataOffset < wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', dataOffset, dataOffset + 4);
      const chunkSize = wavBuffer.readUInt32LE(dataOffset + 4);

      if (chunkId === 'data') {
        dataOffset += 8; // Skip chunk header
        break;
      }

      dataOffset += 8 + chunkSize;
    }

    // Extract PCM samples
    const pcmData = wavBuffer.subarray(dataOffset);
    const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);

    // Convert to mono if stereo (lamejs works better with mono)
    let monoSamples: Int16Array;
    if (numChannels === 2) {
      monoSamples = new Int16Array(samples.length / 2);
      for (let i = 0; i < monoSamples.length; i++) {
        monoSamples[i] = Math.floor((samples[i * 2] + samples[i * 2 + 1]) / 2);
      }
    } else {
      monoSamples = samples;
    }

    // Encode to MP3 using lamejs
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // 1 channel (mono), 128kbps bitrate
    const mp3Data: Uint8Array[] = [];

    const sampleBlockSize = 1152; // MP3 frame size
    for (let i = 0; i < monoSamples.length; i += sampleBlockSize) {
      const sampleChunk = monoSamples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    // Flush remaining data
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    // Combine all MP3 chunks
    const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
    const mp3Buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of mp3Data) {
      mp3Buffer.set(buf, offset);
      offset += buf.length;
    }

    // Add ID3 tags
    const writer = new ID3Writer(mp3Buffer.buffer);

    // Add album art FIRST if provided (important for compatibility)
    if (albumArt) {
      try {
        let imageBuffer = Buffer.from(albumArt.imageData, 'base64');

        // Detect actual image format from magic bytes
        let isPNG = false;
        if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
          isPNG = true;
        }

        console.log('Original album art:', {
          size: imageBuffer.length,
          format: isPNG ? 'PNG' : 'JPEG',
          magicBytes: Array.from(imageBuffer.subarray(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0'))
        });

        // Convert PNG to JPEG for better macOS Finder thumbnail compatibility
        // macOS Finder prefers JPEG format for MP3 thumbnails (like Suno does)
        if (isPNG) {
          console.log('Converting PNG to JPEG for Finder compatibility...');
          const jpegBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();
          imageBuffer = Buffer.from(jpegBuffer);

          console.log('Converted to JPEG:', {
            size: imageBuffer.length,
            magicBytes: Array.from(imageBuffer.subarray(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0'))
          });
        }

        // Add cover art with proper settings for macOS/iTunes/Finder compatibility
        // Key: JPEG format + empty description + useUnicodeEncoding: false
        (writer as any).setFrame('APIC', {
          type: 0x03, // CoverFront
          data: imageBuffer,
          description: '', // Empty description for better iTunes/macOS/Finder compatibility
          useUnicodeEncoding: false // Use ISO-8859-1 encoding for macOS Finder thumbnail compatibility
        });
      } catch (error) {
        console.warn('Failed to add album art to MP3:', error);
      }
    }

    // Add text metadata frames after album art
    writer.setFrame('TIT2', title); // Title
    writer.setFrame('TPE1', [artist]); // Artist
    writer.setFrame('TALB', 'The Smudged Pamphlet Podcast'); // Album

    const taggedArrayBuffer = writer.addTag();

    // Convert tagged MP3 to base64
    const taggedMp3Buffer = Buffer.from(taggedArrayBuffer);
    const mp3Base64 = taggedMp3Buffer.toString('base64');

    res.status(200).json({
      mp3Data: mp3Base64,
      mimeType: 'audio/mpeg',
    });

  } catch (error) {
    console.error('Error converting to MP3:', error);
    res.status(500).json({
      error: 'Failed to convert audio to MP3',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
