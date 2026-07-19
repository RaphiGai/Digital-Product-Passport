import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Image upload drop-zone. Reads a local image file, downscales it on a canvas to
 * keep the payload small, and returns a base64 data URL via onChange. There is no
 * object store in this stack, so the data URL is stored directly in the entity
 * (ProductVariants.image_data) and rendered with <img src=…> like any URL.
 *
 * @param {{
 *   value?: string | null,                 // current image (data URL or http URL)
 *   onChange: (dataUrl: string | null) => void,
 *   disabled?: boolean,
 *   className?: string
 * }} props
 */

const MAX_DIM = 1200; // longest edge in px after downscaling
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB raw-file guard

/** Read a File → downscale to MAX_DIM on the longest edge → JPEG data URL. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = /** @type {string} */ (reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ImageUpload({ value, onChange, disabled, className }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, …).');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('Image is too large (max 10 MB).');
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToDataUrl(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process the image.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className={className}>
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Product preview"
            className="h-40 w-40 rounded-lg border border-black/10 object-cover"
          />
          {!disabled && (
            <div className="absolute right-1.5 top-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={openPicker}
                className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-ink shadow-sm hover:bg-white"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  onChange(null);
                }}
                aria-label="Remove image"
                className="rounded-md bg-white/90 p-1 text-ink-muted shadow-sm hover:bg-white hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          disabled={disabled || busy}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white hover:bg-gray-50',
            (disabled || busy) && 'cursor-not-allowed opacity-60'
          )}
        >
          <ImagePlus className="h-6 w-6 text-ink-muted" />
          <span className="text-sm font-medium text-ink">
            {busy ? 'Processing…' : 'Click to upload or drag & drop'}
          </span>
          <span className="text-xs text-ink-muted">JPG or PNG, max 10 MB — resized automatically</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
