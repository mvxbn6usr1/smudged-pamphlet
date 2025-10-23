/**
 * Convert raw PCM audio data to WAV format with proper headers
 * Gemini TTS returns raw PCM data that needs WAV headers to play in browsers
 */
export function addWavHeader(
  pcmData: Buffer,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;

  const header = Buffer.alloc(headerSize);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk size (16 for PCM)
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22); // Number of channels
  header.writeUInt32LE(sampleRate, 24); // Sample rate
  header.writeUInt32LE(byteRate, 28); // Byte rate
  header.writeUInt16LE(blockAlign, 32); // Block align
  header.writeUInt16LE(bitsPerSample, 34); // Bits per sample

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
