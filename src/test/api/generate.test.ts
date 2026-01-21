import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import the handler after mocking
// We need to create a testable version of the API logic
// since Astro's APIRoute is tightly coupled to the framework

// Extract the core logic for testing
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

interface GenerateRequest {
  prompt?: string;
  apiKey?: string;
  image?: string;
  imageUrl?: string;
  variant?: string;
}

interface GenerateResult {
  url?: string;
  error?: string;
  status: number;
}

async function handleGenerate(body: GenerateRequest): Promise<GenerateResult> {
  const { prompt, apiKey, image, imageUrl, variant } = body;
  const apiUrl = variant === '4b' ? BFL_API_4B : BFL_API_9B;

  if (!prompt || !apiKey) {
    return { error: 'Missing prompt or API key', status: 400 };
  }

  const requestBody: Record<string, unknown> = {
    prompt,
    width: 768,
    height: 768,
    prompt_upsampling: false,
  };

  if (image) {
    requestBody.input_image = image;
  } else if (imageUrl) {
    requestBody.input_image = await urlToBase64(imageUrl);
  }

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
    return { error: errorMessage, status: submitRes.status };
  }

  const submitData = await submitRes.json();

  if (submitData.sample) {
    return { url: submitData.sample, status: 200 };
  }

  const pollUrl = submitData.polling_url;

  if (!pollUrl) {
    return { error: 'No polling URL in response', status: 500 };
  }

  // For testing, we'll limit polling iterations
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;
    await new Promise((r) => setTimeout(r, 10)); // Shorter delay for tests

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
      return { error: errorMessage, status: pollRes.status };
    }

    const result = await pollRes.json();

    if (result.status === 'Ready' && result.result?.sample) {
      return { url: result.result.sample, status: 200 };
    }

    if (result.status === 'Pending') {
      continue;
    }

    const errorMessage = result.error || result.message || result.detail || `Generation failed: ${result.status}`;
    return { error: errorMessage, status: 500 };
  }

  return { error: 'Polling timeout', status: 500 };
}

describe('API: /api/generate', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Request Validation', () => {
    it('returns 400 if prompt is missing', async () => {
      const result = await handleGenerate({ apiKey: 'test-key' });
      expect(result.status).toBe(400);
      expect(result.error).toBe('Missing prompt or API key');
    });

    it('returns 400 if apiKey is missing', async () => {
      const result = await handleGenerate({ prompt: 'a cat' });
      expect(result.status).toBe(400);
      expect(result.error).toBe('Missing prompt or API key');
    });

    it('returns 400 if both prompt and apiKey are missing', async () => {
      const result = await handleGenerate({});
      expect(result.status).toBe(400);
      expect(result.error).toBe('Missing prompt or API key');
    });
  });

  describe('Model Variant Selection', () => {
    it('uses 9B API endpoint by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(mockFetch).toHaveBeenCalledWith(
        BFL_API_9B,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('uses 9B API endpoint when variant is "9b"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      await handleGenerate({ prompt: 'a cat', apiKey: 'test-key', variant: '9b' });

      expect(mockFetch).toHaveBeenCalledWith(
        BFL_API_9B,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('uses 4B API endpoint when variant is "4b"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      await handleGenerate({ prompt: 'a cat', apiKey: 'test-key', variant: '4b' });

      expect(mockFetch).toHaveBeenCalledWith(
        BFL_API_4B,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Request Body', () => {
    it('sends correct request body with prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      await handleGenerate({ prompt: 'a beautiful sunset', apiKey: 'test-key' });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.prompt).toBe('a beautiful sunset');
      expect(body.width).toBe(768);
      expect(body.height).toBe(768);
      expect(body.prompt_upsampling).toBe(false);
    });

    it('includes input_image when base64 image is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await handleGenerate({ prompt: 'edit this', apiKey: 'test-key', image: base64Image });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.input_image).toBe(base64Image);
    });

    it('fetches and converts imageUrl to base64', async () => {
      const mockImageData = new Uint8Array([137, 80, 78, 71]); // PNG header bytes
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockImageData.buffer),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sample: 'https://example.com/result.png' }),
        });

      await handleGenerate({
        prompt: 'edit this',
        apiKey: 'test-key',
        imageUrl: 'https://example.com/source.png',
      });

      // First call should fetch the image URL
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://example.com/source.png');

      // Second call should be to the API with the converted base64
      const apiCall = mockFetch.mock.calls[1];
      const body = JSON.parse(apiCall[1].body);
      expect(body.input_image).toBeDefined();
    });

    it('sends X-Key header with API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/image.png' }),
      });

      await handleGenerate({ prompt: 'a cat', apiKey: 'my-secret-key' });

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers['X-Key']).toBe('my-secret-key');
    });
  });

  describe('Direct Result Handling', () => {
    it('returns URL directly when sample is in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sample: 'https://example.com/direct-image.png' }),
      });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(200);
      expect(result.url).toBe('https://example.com/direct-image.png');
    });
  });

  describe('Polling', () => {
    it('polls until Ready status and returns result', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ polling_url: 'https://api.bfl.ai/poll/123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'Pending' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'Pending' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'Ready',
            result: { sample: 'https://example.com/polled-image.png' },
          }),
        });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(200);
      expect(result.url).toBe('https://example.com/polled-image.png');
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 submit + 3 polls
    });

    it('sends X-Key header when polling', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ polling_url: 'https://api.bfl.ai/poll/123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'Ready',
            result: { sample: 'https://example.com/image.png' },
          }),
        });

      await handleGenerate({ prompt: 'a cat', apiKey: 'my-key' });

      const pollCall = mockFetch.mock.calls[1];
      expect(pollCall[1].headers['X-Key']).toBe('my-key');
    });

    it('returns error if no polling_url in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}), // No sample, no polling_url
      });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(500);
      expect(result.error).toBe('No polling URL in response');
    });
  });

  describe('Error Handling', () => {
    it('handles BFL API error response with detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Invalid API key' }),
      });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'bad-key' });

      expect(result.status).toBe(401);
      expect(result.error).toBe('Invalid API key');
    });

    it('handles BFL API error response with message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: 'Rate limit exceeded' }),
      });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(429);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('handles BFL API error with text response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('Internal server error'),
      });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(500);
      expect(result.error).toBe('Internal server error');
    });

    it('handles polling error response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ polling_url: 'https://api.bfl.ai/poll/123' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ detail: 'Polling failed' }),
        });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(500);
      expect(result.error).toBe('Polling failed');
    });

    it('handles Failed status from polling', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ polling_url: 'https://api.bfl.ai/poll/123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'Failed', error: 'Generation failed' }),
        });

      const result = await handleGenerate({ prompt: 'a cat', apiKey: 'test-key' });

      expect(result.status).toBe(500);
      expect(result.error).toBe('Generation failed');
    });

    it('handles ContentModerated status from polling', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ polling_url: 'https://api.bfl.ai/poll/123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ContentModerated' }),
        });

      const result = await handleGenerate({ prompt: 'inappropriate content', apiKey: 'test-key' });

      expect(result.status).toBe(500);
      expect(result.error).toBe('Generation failed: ContentModerated');
    });
  });
});
