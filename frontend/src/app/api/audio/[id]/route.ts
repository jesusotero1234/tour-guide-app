import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';
const LEGACY_AUDIO_CATALOG_URL = process.env.LEGACY_AUDIO_CATALOG_URL || 'http://host.containers.internal:3006';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: placeId } = await params;

    if (!placeId) {
      return NextResponse.json(
        { error: 'Missing place ID' },
        { status: 400 }
      );
    }

    const filename = decodeURIComponent(placeId);
    const backendUrl = `${BACKEND_URL}/audio/${filename}`;

    console.log(`Audio proxy request for: ${filename}`);

    if (filename.endsWith('.wav')) {
      const backendResponse = await fetch(backendUrl);
      if (backendResponse.ok) {
        const audioBuffer = await backendResponse.arrayBuffer();

        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': backendResponse.headers.get('Content-Type') || 'audio/wav',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    }

    // Legacy compatibility: older records may only have place ids that need a
    // catalog lookup before resolving the actual audio file URL.
    try {
      const catalogResponse = await fetch(`${LEGACY_AUDIO_CATALOG_URL}/audio/place/${placeId}`);

      if (catalogResponse.ok) {
        const audioData = await catalogResponse.json();

        if (audioData.success && audioData.data && audioData.data.length > 0) {
          const audioUrl = audioData.data[0].url;
          if (audioUrl) {
            return NextResponse.redirect(audioUrl);
          }
        }
      }
    } catch {
      // Legacy catalog not available — fall through to local backend.
      console.log('Legacy audio catalog not available, falling back to local backend');
    }

    // Fallback: proxy from local backend (development)

    const backendResponse = await fetch(backendUrl);
    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: 'Audio not found' },
        { status: 404 }
      );
    }

    const audioBuffer = await backendResponse.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': backendResponse.headers.get('Content-Type') || 'audio/wav',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error proxying audio request:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
