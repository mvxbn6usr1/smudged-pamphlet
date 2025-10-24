/**
 * DEPRECATED: Do not embed album art in WAV files - it breaks the format
 * Instead, store album art separately in IndexedDB
 * This function now just returns the original WAV unchanged
 */
export function embedAlbumArtInWav(
  wavDataUrl: string,
  albumArtData: string, // base64 image data
  albumArtMimeType: string = 'image/png'
): string {
  // DO NOT modify the WAV file - prepending ID3 tags breaks the RIFF format
  // Album art is now stored separately in IndexedDB
  console.log('Album art stored separately - WAV file unchanged');
  return wavDataUrl;
}

function createID3v2Tag(imageBuffer: Buffer, mimeType: string): Buffer {
  // ID3v2.3 Header
  const header = Buffer.alloc(10);
  header.write('ID3', 0); // Identifier
  header.writeUInt8(3, 3); // Version 2.3
  header.writeUInt8(0, 4); // Revision 0
  header.writeUInt8(0, 5); // Flags (no flags)

  // APIC Frame (Attached Picture)
  const apicFrame = createAPICFrame(imageBuffer, mimeType);

  // Write total tag size (excluding header) as synchsafe integer
  const tagSize = apicFrame.length;
  writeSynchsafeInt(header, 6, tagSize);

  return Buffer.concat([header, apicFrame]);
}

function createAPICFrame(imageBuffer: Buffer, mimeType: string): Buffer {
  // Frame ID
  const frameId = Buffer.from('APIC');

  // Picture type mapping
  const pictureType = 3; // 3 = Cover (front)

  // MIME type as null-terminated string
  const mimeTypeStr = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const mimeTypeBuffer = Buffer.from(mimeTypeStr + '\0');

  // Description (empty, null-terminated)
  const description = Buffer.from('\0');

  // Text encoding (0 = ISO-8859-1)
  const textEncoding = Buffer.from([0]);

  // Picture type byte
  const pictureTypeByte = Buffer.from([pictureType]);

  // Assemble frame data
  const frameData = Buffer.concat([
    textEncoding,
    mimeTypeBuffer,
    pictureTypeByte,
    description,
    imageBuffer
  ]);

  // Frame size (excluding frame header)
  const frameSize = frameData.length;
  const frameSizeBuffer = Buffer.alloc(4);
  frameSizeBuffer.writeUInt32BE(frameSize, 0);

  // Frame flags (no flags)
  const frameFlags = Buffer.from([0, 0]);

  // Assemble complete frame
  return Buffer.concat([
    frameId,
    frameSizeBuffer,
    frameFlags,
    frameData
  ]);
}

function writeSynchsafeInt(buffer: Buffer, offset: number, value: number): void {
  // Synchsafe integer: 7 bits per byte (MSB is always 0)
  buffer.writeUInt8((value >> 21) & 0x7F, offset);
  buffer.writeUInt8((value >> 14) & 0x7F, offset + 1);
  buffer.writeUInt8((value >> 7) & 0x7F, offset + 2);
  buffer.writeUInt8(value & 0x7F, offset + 3);
}

/**
 * Extract album art from WAV file with ID3v2 tag
 * Returns base64 image data and mime type, or null if no album art found
 */
export function extractAlbumArtFromWav(wavDataUrl: string): { data: string; mimeType: string } | null {
  try {
    const base64Data = wavDataUrl.split(',')[1];
    const wavBuffer = Buffer.from(base64Data, 'base64');

    // Check for ID3v2 header
    if (wavBuffer.length < 10 || wavBuffer.toString('utf8', 0, 3) !== 'ID3') {
      return null; // No ID3 tag
    }

    // Read tag size (synchsafe integer)
    const tagSize = readSynchsafeInt(wavBuffer, 6);

    // Find APIC frame
    let offset = 10; // After ID3 header
    const tagEnd = 10 + tagSize;

    while (offset < tagEnd) {
      if (offset + 10 > wavBuffer.length) break;

      const frameId = wavBuffer.toString('utf8', offset, offset + 4);
      const frameSize = wavBuffer.readUInt32BE(offset + 4);

      if (frameId === 'APIC') {
        // Found APIC frame
        const frameData = wavBuffer.slice(offset + 10, offset + 10 + frameSize);

        // Parse APIC frame
        let dataOffset = 0;

        // Skip text encoding byte
        dataOffset += 1;

        // Read MIME type (null-terminated)
        let mimeType = '';
        while (frameData[dataOffset] !== 0 && dataOffset < frameData.length) {
          mimeType += String.fromCharCode(frameData[dataOffset]);
          dataOffset++;
        }
        dataOffset++; // Skip null terminator

        // Skip picture type byte
        dataOffset += 1;

        // Skip description (null-terminated)
        while (frameData[dataOffset] !== 0 && dataOffset < frameData.length) {
          dataOffset++;
        }
        dataOffset++; // Skip null terminator

        // Rest is image data
        const imageData = frameData.slice(dataOffset);
        return {
          data: imageData.toString('base64'),
          mimeType: mimeType || 'image/png'
        };
      }

      offset += 10 + frameSize;
    }

    return null;
  } catch (error) {
    console.error('Error extracting album art:', error);
    return null;
  }
}

function readSynchsafeInt(buffer: Buffer, offset: number): number {
  return (
    (buffer[offset] & 0x7F) << 21 |
    (buffer[offset + 1] & 0x7F) << 14 |
    (buffer[offset + 2] & 0x7F) << 7 |
    (buffer[offset + 3] & 0x7F)
  );
}
