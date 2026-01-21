import type { APIRoute } from 'astro';

const BFL_API_9B = 'https://api.bfl.ai/v1/flux-2-klein-9b';
const BFL_API_4B = 'https://api.bfl.ai/v1/flux-2-klein-4b';

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const POST: APIRoute = async ({ request }) => {
  const { prompt, apiKey, image, imageUrl, variant } = await request.json();
  const apiUrl = variant === '4b' ? BFL_API_4B : BFL_API_9B;

  if (!prompt || !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing prompt or API key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requestBody: Record<string, unknown> = {
    prompt,
    width: 768,
    height: 768,
    prompt_upsampling: false,
  };

  // Handle input image - either base64 directly or fetch from URL
  if (image) {
    requestBody.input_image = image;
  } else if (imageUrl) {
    requestBody.input_image = await urlToBase64(imageUrl);
  }

  // Submit to BFL
  const submitRes = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitRes.ok) {
    let errorMessage = `BFL API error (${submitRes.status})`;
    try {
      const errorData = await submitRes.json();
      errorMessage = errorData.detail || errorData.message || errorData.error || JSON.stringify(errorData);
    } catch {
      errorMessage = await submitRes.text() || errorMessage;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: submitRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const submitData = await submitRes.json();

  // If direct result, return it
  if (submitData.sample) {
    return new Response(JSON.stringify({ url: submitData.sample }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Poll for result
  const pollUrl = submitData.polling_url;

  if (!pollUrl) {
    return new Response(JSON.stringify({ error: 'No polling URL in response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  while (true) {
    await new Promise((r) => setTimeout(r, 500));

    const pollRes = await fetch(pollUrl, {
      headers: { 'X-Key': apiKey },
    });

    if (!pollRes.ok) {
      let errorMessage = `Poll error (${pollRes.status})`;
      try {
        const errorData = await pollRes.json();
        errorMessage = errorData.detail || errorData.message || errorData.error || JSON.stringify(errorData);
      } catch {
        errorMessage = await pollRes.text() || errorMessage;
      }
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: pollRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await pollRes.json();

    if (result.status === 'Ready' && result.result?.sample) {
      return new Response(JSON.stringify({ url: result.result.sample }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Keep polling only if status is Pending
    if (result.status === 'Pending') {
      continue;
    }

    // Any other status is an error (Error, Failed, Moderated, ContentModerated, etc.)
    const errorMessage = result.error || result.message || result.detail || `Generation failed: ${result.status}`;
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
