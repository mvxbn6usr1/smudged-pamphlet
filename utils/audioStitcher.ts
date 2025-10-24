/**
 * Utilities for stitching together multiple WAV audio files
 */

interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataSize: number;
}

/**
 * Parse WAV header from a data URL
 */
function parseWavHeader(dataUrl: string): WavHeader {
  const base64 = dataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');

  return {
    sampleRate: buffer.readUInt32LE(24),
    numChannels: buffer.readUInt16LE(22),
    bitsPerSample: buffer.readUInt16LE(34),
    dataSize: buffer.readUInt32LE(40),
  };
}

/**
 * Extract PCM data from WAV file (skip header)
 */
function extractPcmData(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');

  // WAV header is 44 bytes
  return buffer.slice(44);
}

/**
 * Create WAV header for given PCM data
 */
function createWavHeader(
  pcmDataSize: number,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const headerSize = 44;
  const fileSize = headerSize + pcmDataSize - 8;

  const header = Buffer.alloc(headerSize);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk size (16 for PCM)
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(pcmDataSize, 40);

  return header;
}

/**
 * Stitch multiple WAV audio files together into one continuous WAV
 * @param dataUrls Array of WAV file data URLs
 * @returns Single stitched WAV file as data URL
 */
export function stitchWavFiles(dataUrls: string[]): string {
  if (dataUrls.length === 0) {
    throw new Error('No audio files to stitch');
  }

  if (dataUrls.length === 1) {
    return dataUrls[0];
  }

  // Get header info from first file (assume all have same format)
  const headerInfo = parseWavHeader(dataUrls[0]);

  // Extract PCM data from all files
  const pcmBuffers = dataUrls.map(url => extractPcmData(url));

  // Concatenate all PCM data
  const totalPcmData = Buffer.concat(pcmBuffers);

  // Create new WAV header for combined data
  const newHeader = createWavHeader(
    totalPcmData.length,
    headerInfo.sampleRate,
    headerInfo.numChannels,
    headerInfo.bitsPerSample
  );

  // Combine header and data
  const stitchedWav = Buffer.concat([newHeader, totalPcmData]);

  // Convert to data URL
  const base64 = stitchedWav.toString('base64');
  return `data:audio/wav;base64,${base64}`;
}
