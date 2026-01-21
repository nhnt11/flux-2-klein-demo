import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './ImageGenerator.module.css';

function cx(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

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
    <div className={styles.container}>
      <div className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>FLUX.2 <span className={styles.klein}>[klein]</span></h1>
            <p className={styles.tagline}>
              Ultra-fast image generation by{' '}
              <a href="https://blackforestlabs.ai" target="_blank" rel="noreferrer">
                Black Forest Labs
              </a>
            </p>
          </div>
          <a
            href="https://github.com/nhnt11-bfl/flux-2-klein-api-demo"
            target="_blank"
            rel="noreferrer"
            className={styles.githubLink}
            aria-label="View source on GitHub"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </header>

        <div className={styles.settingsRow}>
          <div className={styles.apiKeyContainer}>
            <input
              type="text"
              placeholder="Enter your BFL API key"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
            />
            <p className={styles.apiKeyHint}>
              Don't have a key?{' '}
              <a href="https://dashboard.bfl.ai/get-started" target="_blank" rel="noreferrer">
                Get started here
              </a>
            </p>
          </div>
          <div className={styles.modelSelect}>
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
          className={cx(styles.imageContainer, isDragOver && styles.dragOver)}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={cx(styles.dropOverlay, isDragOver && styles.visible)}>
            Drop image here
          </div>
          <div className={cx(
            styles.loadingOverlay,
            showLoading && styles.visible,
            loadingComplete && styles.complete
          )}>
            <div className={styles.spinner} />
            <svg className={styles.checkIcon} width="48" height="48" viewBox="0 0 24 24" fill="none">
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
            <img
              src={previousImageUrl}
              className={cx(styles.generatedImage, styles.previous)}
              alt=""
            />
          )}
          {currentImageUrl && (
            <img
              src={currentImageUrl}
              className={cx(
                styles.generatedImage,
                styles.current,
                showCurrentImage && styles.show
              )}
              alt=""
            />
          )}
          {!hasImage && (
            <div className={styles.placeholder}>
              <p>Enter a prompt below to generate an image</p>
              <p className={styles.placeholderHint}>Or drag & drop a reference image</p>
            </div>
          )}
        </div>

        <div className={cx(styles.editModeToggle, !hasImage && styles.disabled)}>
          <div
            className={cx(
              styles.toggleSwitch,
              editMode && styles.active,
              !hasImage && styles.disabled
            )}
            onClick={() => hasImage && setEditMode(!editMode)}
          />
          <span className={styles.toggleLabel}>Edit mode</span>
          <span className={styles.toggleDescription}>
            — Use the current image as a reference for the next generation
          </span>
        </div>

        <div className={styles.promptContainer}>
          <input
            type="text"
            placeholder="Describe an image..."
            autoComplete="off"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className={styles.genTime}>{genTime}</span>
        </div>
      </div>
    </div>
  );
}
