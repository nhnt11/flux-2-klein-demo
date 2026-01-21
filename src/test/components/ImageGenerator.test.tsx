import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageGenerator from '../../components/ImageGenerator';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ImageGenerator Component', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
    vi.mocked(alert).mockReset();
  });

  describe('Rendering', () => {
    it('renders the header with title', () => {
      render(<ImageGenerator />);
      expect(screen.getByText('FLUX.2')).toBeInTheDocument();
      expect(screen.getByText('[klein]')).toBeInTheDocument();
    });

    it('renders the tagline with link', () => {
      render(<ImageGenerator />);
      const link = screen.getByText('Black Forest Labs');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://blackforestlabs.ai');
    });

    it('renders API key input', () => {
      render(<ImageGenerator />);
      expect(screen.getByPlaceholderText('Enter your BFL API key')).toBeInTheDocument();
    });

    it('renders model variant selector with default value', () => {
      render(<ImageGenerator />);
      const select = screen.getByLabelText('Model variant:');
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('9b');
    });

    it('renders prompt input', () => {
      render(<ImageGenerator />);
      expect(screen.getByPlaceholderText('Describe an image...')).toBeInTheDocument();
    });

    it('renders placeholder when no image', () => {
      render(<ImageGenerator />);
      expect(screen.getByText('Enter a prompt below to generate an image')).toBeInTheDocument();
      expect(screen.getByText('Or drag & drop a reference image')).toBeInTheDocument();
    });

    it('renders edit mode toggle as disabled initially', () => {
      render(<ImageGenerator />);
      const toggle = screen.getByText('Edit mode').parentElement;
      expect(toggle).toHaveClass('disabled');
    });
  });

  describe('API Key Management', () => {
    it('loads API key from localStorage on mount', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('saved-api-key');
      render(<ImageGenerator />);

      expect(localStorage.getItem).toHaveBeenCalledWith('bfl_api_key');
      expect(screen.getByPlaceholderText('Enter your BFL API key')).toHaveValue('saved-api-key');
    });

    it('saves API key to localStorage when changed', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);
      const input = screen.getByPlaceholderText('Enter your BFL API key');

      await user.type(input, 'new-api-key');

      expect(localStorage.setItem).toHaveBeenCalled();
      const lastCall = vi.mocked(localStorage.setItem).mock.calls.pop();
      expect(lastCall?.[0]).toBe('bfl_api_key');
      expect(lastCall?.[1]).toContain('new-api-key');
    });

    it('shows alert when trying to generate without API key', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      expect(alert).toHaveBeenCalledWith('Please enter your BFL API key');
    });
  });

  describe('Model Variant Selection', () => {
    it('can change model variant to 4b', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);
      const select = screen.getByLabelText('Model variant:');

      await user.selectOptions(select, '4b');

      expect(select).toHaveValue('4b');
    });

    it('sends correct variant to API', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const select = screen.getByLabelText('Model variant:');
      await user.selectOptions(select, '4b');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.variant).toBe('4b');
    });
  });

  describe('Prompt Input', () => {
    it('updates prompt value on input', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);
      const input = screen.getByPlaceholderText('Describe an image...');

      await user.type(input, 'a beautiful sunset');

      expect(input).toHaveValue('a beautiful sunset');
    });

    it('triggers generation on Enter key', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('does not trigger generation on empty prompt', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, '   '); // Only whitespace
      await user.keyboard('{Enter}');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('trims whitespace from prompt before sending', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, '  a cat  ');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.prompt).toBe('a cat');
    });
  });

  describe('Generation Flow', () => {
    it('shows loading overlay during generation', async () => {
      const user = userEvent.setup();
      let resolveGeneration: (value: unknown) => void;
      const generationPromise = new Promise((resolve) => {
        resolveGeneration = resolve;
      });

      mockFetch.mockReturnValueOnce(generationPromise);

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      // Loading overlay should be visible
      await waitFor(() => {
        const overlay = document.querySelector('.loading-overlay');
        expect(overlay).toHaveClass('visible');
      });

      // Resolve the generation
      await act(async () => {
        resolveGeneration!({
          ok: true,
          json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
        });
      });
    });

    it('displays timer during generation', async () => {
      const user = userEvent.setup();
      let resolveGeneration: (value: unknown) => void;
      const generationPromise = new Promise((resolve) => {
        resolveGeneration = resolve;
      });

      mockFetch.mockReturnValueOnce(generationPromise);

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      // Timer should start at 0.0s
      await waitFor(() => {
        const genTime = document.querySelector('.gen-time');
        expect(genTime?.textContent).toMatch(/\d+\.\d+s/);
      });

      await act(async () => {
        resolveGeneration!({
          ok: true,
          json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
        });
      });
    });

    it('prevents multiple simultaneous generations', async () => {
      const user = userEvent.setup();
      let resolveGeneration: (value: unknown) => void;
      const generationPromise = new Promise((resolve) => {
        resolveGeneration = resolve;
      });

      mockFetch.mockReturnValue(generationPromise);

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');

      // Trigger first generation
      await user.keyboard('{Enter}');

      // Try to trigger second generation
      await user.keyboard('{Enter}');
      await user.keyboard('{Enter}');

      // Only one fetch should be made
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveGeneration!({
          ok: true,
          json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
        });
      });
    });

    it('hides placeholder after successful generation', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const placeholder = screen.queryByText('Enter a prompt below to generate an image');
        expect(placeholder).not.toBeInTheDocument();
      });
    });

    it('displays generated image', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const img = document.querySelector('.generated-image.current');
        expect(img).toHaveAttribute('src', 'https://example.com/image.png');
      });
    });
  });

  describe('Edit Mode', () => {
    it('toggle is disabled when no image exists', () => {
      render(<ImageGenerator />);
      const toggleContainer = screen.getByText('Edit mode').parentElement;
      expect(toggleContainer).toHaveClass('disabled');
    });

    it('toggle becomes enabled after image generation', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const toggleContainer = screen.getByText('Edit mode').parentElement;
        expect(toggleContainer).not.toHaveClass('disabled');
      });
    });

    it('clicking toggle changes edit mode state', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const toggleSwitch = document.querySelector('.toggle-switch');
        expect(toggleSwitch).not.toHaveClass('disabled');
      });

      const toggleSwitch = document.querySelector('.toggle-switch')!;
      await user.click(toggleSwitch);

      expect(toggleSwitch).toHaveClass('active');
    });

    it('does not toggle when disabled', async () => {
      const user = userEvent.setup();
      render(<ImageGenerator />);

      const toggleSwitch = document.querySelector('.toggle-switch')!;
      await user.click(toggleSwitch);

      expect(toggleSwitch).not.toHaveClass('active');
    });

    it('sends image URL when edit mode is on', async () => {
      const user = userEvent.setup();
      // First generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/first-image.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const toggleSwitch = document.querySelector('.toggle-switch');
        expect(toggleSwitch).not.toHaveClass('disabled');
      });

      // Enable edit mode
      const toggleSwitch = document.querySelector('.toggle-switch')!;
      await user.click(toggleSwitch);

      // Second generation with edit mode
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/second-image.png' }),
      });

      await user.clear(promptInput);
      await user.type(promptInput, 'make it blue');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const secondCall = mockFetch.mock.calls[1];
      const body = JSON.parse(secondCall[1].body);
      expect(body.imageUrl).toBe('https://example.com/first-image.png');
    });
  });

  describe('Error Handling', () => {
    it('shows alert on API error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith('Server error');
      });
    });

    it('clears timer on error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const genTime = document.querySelector('.gen-time');
        expect(genTime?.textContent).toBe('');
      });
    });

    it('hides loading overlay on error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const overlay = document.querySelector('.loading-overlay');
        expect(overlay).not.toHaveClass('visible');
      });
    });

    it('allows new generation after error', async () => {
      const user = userEvent.setup();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: 'https://example.com/image.png' }),
        });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(alert).toHaveBeenCalled();
      });

      // Try again
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Drag and Drop', () => {
    it('shows drop overlay on drag enter', async () => {
      render(<ImageGenerator />);

      const imageContainer = document.querySelector('.image-container')!;

      fireEvent.dragEnter(imageContainer, {
        dataTransfer: { files: [] },
      });

      await waitFor(() => {
        const dropOverlay = document.querySelector('.drop-overlay');
        expect(dropOverlay).toHaveClass('visible');
      });
    });

    it('hides drop overlay on drag leave', async () => {
      render(<ImageGenerator />);

      const imageContainer = document.querySelector('.image-container')!;

      fireEvent.dragEnter(imageContainer, {
        dataTransfer: { files: [] },
      });

      fireEvent.dragLeave(imageContainer, {
        dataTransfer: { files: [] },
      });

      await waitFor(() => {
        const dropOverlay = document.querySelector('.drop-overlay');
        expect(dropOverlay).not.toHaveClass('visible');
      });
    });

    it('adds drag-over class to container on drag enter', () => {
      render(<ImageGenerator />);

      const imageContainer = document.querySelector('.image-container')!;

      fireEvent.dragEnter(imageContainer, {
        dataTransfer: { files: [] },
      });

      expect(imageContainer).toHaveClass('drag-over');
    });

    it('ignores non-image files', () => {
      render(<ImageGenerator />);

      const imageContainer = document.querySelector('.image-container')!;

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      fireEvent.drop(imageContainer, {
        dataTransfer: { files: [file] },
      });

      // Placeholder should still be visible
      expect(screen.getByText('Enter a prompt below to generate an image')).toBeInTheDocument();
    });
  });

  describe('Image Crossfade', () => {
    it('moves current image to previous on new generation', async () => {
      const user = userEvent.setup();
      // First generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/first.png' }),
      });

      render(<ImageGenerator />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your BFL API key');
      await user.type(apiKeyInput, 'test-key');

      const promptInput = screen.getByPlaceholderText('Describe an image...');
      await user.type(promptInput, 'a cat');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const currentImg = document.querySelector('.generated-image.current');
        expect(currentImg).toHaveAttribute('src', 'https://example.com/first.png');
      });

      // Second generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.com/second.png' }),
      });

      await user.clear(promptInput);
      await user.type(promptInput, 'a dog');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        const previousImg = document.querySelector('.generated-image.previous');
        expect(previousImg).toHaveAttribute('src', 'https://example.com/first.png');

        const currentImg = document.querySelector('.generated-image.current');
        expect(currentImg).toHaveAttribute('src', 'https://example.com/second.png');
      });
    });
  });
});
