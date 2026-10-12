import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

@Component({
  selector: 'app-barcode-scanner',
  template: `
    <button class="camera-button" type="button" (click)="start()">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path d="M3 6.5h3l1.2-2h5.6l1.2 2h3v9H3v-9Z" />
        <circle cx="10" cy="11" r="3" />
      </svg>
      Scan a barcode
    </button>
    @if (modalOpen()) {
      <div class="camera-backdrop" (click)="$event.target === $event.currentTarget && stop()">
        <section
          class="camera-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-dialog-title"
          (keydown.escape)="stop()"
        >
          <button class="close-button" type="button" aria-label="Close camera" (click)="stop()">
            ×
          </button>
          <p class="eyebrow">Barcode scanner</p>
          <h2 id="camera-dialog-title">Scan a product</h2>
          <div class="preview">
            <video #video autoplay muted playsinline></video>
            <p role="status">
              {{ scanning() ? 'Point the camera at a barcode.' : 'Starting camera…' }}
            </p>
          </div>
          @if (error()) {
            <p class="error" role="status">{{ error() }}</p>
          }
          <button class="cancel-button" type="button" (click)="stop()">Close camera</button>
        </section>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .camera-button {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 0 16px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #fff;
        color: var(--ink);
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
        transition:
          background-color 140ms ease,
          border-color 140ms ease,
          transform 140ms ease;
      }
      .camera-button:hover {
        border-color: #c9cbb8;
        background: #f5f5ee;
        transform: translateY(-1px);
      }
      .camera-button:focus-visible {
        outline: 3px solid #9aaf81;
        outline-offset: 3px;
      }
      .camera-button-active {
        border-color: #a3261d;
        color: #8d2119;
      }
      .camera-button-active:hover {
        border-color: #a3261d;
        background: #fff1ed;
      }
      .camera-button svg {
        width: 17px;
        height: 17px;
        stroke: currentColor;
        stroke-width: 1.7;
      }
      .camera-backdrop {
        position: fixed;
        z-index: 1000;
        inset: 0;
        display: grid;
        place-items: center;
        overflow: auto;
        padding: 20px;
        background: rgba(29, 36, 26, 0.58);
      }
      .camera-dialog {
        position: relative;
        display: flex;
        width: min(100%, 520px);
        flex-direction: column;
        gap: 14px;
        padding: 28px;
        border-radius: 16px;
        background: #fffefa;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24);
      }
      .camera-dialog .eyebrow,
      .camera-dialog h2,
      .camera-dialog .error {
        margin: 0;
      }
      .camera-dialog .eyebrow {
        color: #667052;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .camera-dialog h2 {
        color: #303a27;
        font:
          400 27px Georgia,
          serif;
      }
      .close-button {
        position: absolute;
        top: 14px;
        right: 16px;
        width: 36px;
        height: 36px;
        border: 1px solid #dce4d7;
        border-radius: 50%;
        background: #fffefa;
        color: #667052;
        font-size: 24px;
        cursor: pointer;
      }
      .preview {
        overflow: hidden;
        border-radius: 12px;
        background: #171a14;
      }
      video {
        display: block;
        width: 100%;
        max-height: 55vh;
        object-fit: cover;
      }
      .preview p {
        margin: 0;
        padding: 10px 12px;
        color: white;
        font-size: 13px;
      }
      .error {
        color: #a3261d;
        font-size: 13px;
      }
      .cancel-button {
        align-self: flex-end;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid #dce4d7;
        border-radius: 999px;
        background: #fff;
        color: #303a27;
        font: inherit;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
      }
      .cancel-button:hover,
      .close-button:hover {
        border-color: #aab99d;
        background: #f0f4e8;
      }
      @media (max-width: 540px) {
        :host {
          display: flex;
          width: 100%;
        }
        .camera-button {
          width: 100%;
        }
      }
      @media (max-width: 480px) {
        .camera-dialog {
          padding: 24px 18px;
        }
      }
    `,
  ],
})
export class BarcodeScannerComponent implements OnDestroy {
  readonly detected = output<string>();
  readonly scanning = signal(false);
  readonly modalOpen = signal(false);
  readonly error = signal('');
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private controls: { stop: () => void } | null = null;
  private generation = 0;

  async start(): Promise<void> {
    if (this.modalOpen()) {
      return;
    }
    this.error.set('');
    this.modalOpen.set(true);
    this.changeDetector.detectChanges();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera access is unavailable. Enter the barcode manually.');
      return;
    }
    try {
      const generation = ++this.generation;
      const video = this.video()?.nativeElement;
      if (!video) {
        throw new Error('Camera preview is unavailable.');
      }
      const hints = new Map<DecodeHintType, unknown>([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
        ],
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      this.scanning.set(true);
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || generation !== this.generation) {
          return;
        }
        this.detected.emit(result.getText());
        this.stop();
      });
      if (generation !== this.generation) {
        controls.stop();
      } else {
        this.controls = controls;
      }
    } catch (error) {
      this.controls?.stop();
      this.controls = null;
      this.scanning.set(false);
      this.error.set(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access or enter the barcode manually.'
          : 'Could not start the camera. Enter the barcode manually.',
      );
    }
  }

  stop(): void {
    this.generation += 1;
    this.scanning.set(false);
    this.modalOpen.set(false);
    this.controls?.stop();
    this.controls = null;
    const video = this.video()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }
  ngOnDestroy(): void {
    this.stop();
  }
}
