import { useState, useEffect, useRef, useCallback } from 'react';

export default function ImageGenerator() {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [modelVariant, setModelVariant] = useState('9b');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);
  const [showCurrentImage, setShowCurrentImage] = useState(false);
  const [genTime, setGenTime] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);

  const referenceImageBase64Ref = useRef<string | null>(null);
  const dragCounterRef = useRef(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasImage = currentImageUrl !== null;

  useEffect(() => {
    const savedKey = localStorage.getItem('bfl_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem('bfl_api_key', value);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const generateImage = async (promptText: string): Promise<string | null> => {
    if (!apiKey) {
      alert('Please enter your BFL API key');
      return null;
    }

    const body: Record<string, unknown> = {
      prompt: promptText,
      apiKey,
      variant: modelVariant,
    };

    if (editMode && currentImageUrl) {
      if (currentImageUrl.startsWith('blob:')) {
        body.image = referenceImageBase64Ref.current;
      } else {
        body.imageUrl = currentImageUrl;
      }
    }

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Request failed (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data.url;
  };

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    const startTime = Date.now();

    setShowLoading(true);
    setLoadingComplete(false);
    setGenTime('0.0s');

    timerIntervalRef.current = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setGenTime(`${elapsed}s`);
    }, 100);

    try {
      const imageUrl = await generateImage(trimmedPrompt);

      // Stop timer when generation completes (not when image loads)
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setGenTime(`${elapsed}s`);

      setLoadingComplete(true);

      if (imageUrl) {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageUrl;
        });

        if (currentImageUrl) {
          setPreviousImageUrl(currentImageUrl);
          setShowCurrentImage(false);
        }

        setCurrentImageUrl(imageUrl);

        setShowLoading(false);
        setLoadingComplete(false);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setShowCurrentImage(true);
          });
        });
      }
    } catch (error) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      setGenTime('');
      console.error('Generation failed:', error);
      alert(error instanceof Error ? error.message : 'Generation failed');
      setShowLoading(false);
      setLoadingComplete(false);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isGenerating, apiKey, modelVariant, editMode, currentImageUrl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      referenceImageBase64Ref.current = await fileToBase64(file);
      const url = URL.createObjectURL(file);

      if (currentImageUrl) {
        setPreviousImageUrl(currentImageUrl);
        setShowCurrentImage(false);
      }

      setCurrentImageUrl(url);
      setEditMode(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowCurrentImage(true);
        });
      });
    }
  };

  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault();
    document.addEventListener('dragover', preventDefault);
    document.addEventListener('drop', preventDefault);
    return () => {
      document.removeEventListener('dragover', preventDefault);
      document.removeEventListener('drop', preventDefault);
    };
  }, []);

  return (
    <div className="container">
      <div className="main-content">
        <header className="header">
          <h1>FLUX.2 <span className="klein">[klein]</span></h1>
          <p className="tagline">
            Ultra-fast image generation by{' '}
            <a href="https://blackforestlabs.ai" target="_blank" rel="noreferrer">
              Black Forest Labs
            </a>
          </p>
        </header>

        <div className="settings-row">
          <div className="api-key-container">
            <input
              type="text"
              placeholder="Enter your BFL API key"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
            />
            <p className="api-key-hint">
              Don't have a key?{' '}
              <a href="https://dashboard.bfl.ai/get-started" target="_blank" rel="noreferrer">
                Get started here
              </a>
            </p>
          </div>
          <div className="model-select">
            <label htmlFor="modelVariant">Model variant:</label>
            <select
              id="modelVariant"
              value={modelVariant}
              onChange={(e) => setModelVariant(e.target.value)}
            >
              <option value="9b">9B</option>
              <option value="4b">4B</option>
            </select>
          </div>
        </div>

        <div
          className={`image-container${isDragOver ? ' drag-over' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={`drop-overlay${isDragOver ? ' visible' : ''}`}>
            Drop image here
          </div>
          <div className={`loading-overlay${showLoading ? ' visible' : ''}${loadingComplete ? ' complete' : ''}`}>
            <div className="spinner" />
            <svg className="check-icon" width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12.5L9 17.5L20 6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {previousImageUrl && (
            <img src={previousImageUrl} className="generated-image previous" alt="" />
          )}
          {currentImageUrl && (
            <img
              src={currentImageUrl}
              className={`generated-image current${showCurrentImage ? ' show' : ''}`}
              alt=""
            />
          )}
          {!hasImage && (
            <div className="placeholder">
              <p>Enter a prompt below to generate an image</p>
              <p className="hint">Or drag & drop a reference image</p>
            </div>
          )}
        </div>

        <div className={`edit-mode-toggle${hasImage ? '' : ' disabled'}`}>
          <div
            className={`toggle-switch${editMode ? ' active' : ''}${hasImage ? '' : ' disabled'}`}
            onClick={() => hasImage && setEditMode(!editMode)}
          />
          <span className="toggle-label">Edit mode</span>
          <span className="toggle-description">
            — Use the current image as a reference for the next generation
          </span>
        </div>

        <div className="prompt-container">
          <input
            type="text"
            placeholder="Describe an image..."
            autoComplete="off"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="gen-time">{genTime}</span>
        </div>
      </div>
    </div>
  );
}
