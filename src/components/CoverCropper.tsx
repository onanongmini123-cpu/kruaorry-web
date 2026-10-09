"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Move, RotateCcw, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui";
import {
  cropAndOptimizeResourceCover,
  DEFAULT_RESOURCE_COVER_CROP,
  isResourceCoverAspect,
  panResourceCoverCrop,
  RESOURCE_CARD_ASPECT,
  RESOURCE_COVER_MAX_ZOOM,
  RESOURCE_COVER_MIN_ZOOM,
  resourceCoverCropRect,
  resourceCoverFileName,
  resourceCoverPreviewRect,
  type ResourceCoverCrop,
  type ResourceCoverRect,
} from "@/lib/resourceCoverCrop";

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

type Props = {
  file: File;
  onConfirm: (file: File, output: { width: number; height: number; extension: "webp" | "jpg" }) => void;
  onCancel: () => void;
};

function drawRect(
  canvas: HTMLCanvasElement | null,
  image: LoadedImage,
  rect: ResourceCoverRect,
): void {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image.element,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function drawPreviews(
  workspace: HTMLCanvasElement | null,
  detail: HTMLCanvasElement | null,
  card: HTMLCanvasElement | null,
  image: LoadedImage,
  crop: ResourceCoverCrop,
): void {
  const coverRect = resourceCoverCropRect(image.width, image.height, crop);
  drawRect(workspace, image, coverRect);
  drawRect(detail, image, coverRect);
  drawRect(card, image, resourceCoverPreviewRect(coverRect, RESOURCE_CARD_ASPECT));
}

export function CoverCropper({ file, onConfirm, onCancel }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLCanvasElement>(null);
  const detailPreviewRef = useRef<HTMLCanvasElement>(null);
  const cardPreviewRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<ResourceCoverCrop>(DEFAULT_RESOURCE_COVER_CROP);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (!active) return;
      if (nextImage.naturalWidth <= 0 || nextImage.naturalHeight <= 0) {
        setError("อ่านขนาดภาพไม่ได้ กรุณาเลือกไฟล์ใหม่");
        return;
      }
      setCrop(DEFAULT_RESOURCE_COVER_CROP);
      setImage({ element: nextImage, width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setError(null);
    };
    nextImage.onerror = () => {
      if (active) setError("เปิดไฟล์ภาพไม่ได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ใหม่");
    };
    nextImage.src = url;

    return () => {
      active = false;
      dragRef.current = null;
      nextImage.onload = null;
      nextImage.onerror = null;
      nextImage.src = "";
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!image) return;
    drawPreviews(workspaceRef.current, detailPreviewRef.current, cardPreviewRef.current, image, crop);
  }, [crop, image]);

  const updatePan = (deltaX: number, deltaY: number, viewportWidth: number, viewportHeight: number) => {
    if (!image || processing) return;
    setCrop((current) => panResourceCoverCrop(
      current,
      deltaX,
      deltaY,
      viewportWidth,
      viewportHeight,
      image.width,
      image.height,
    ));
  };

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image || processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const drag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = dragRef.current;
    if (!previous || previous.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updatePan(event.clientX - previous.x, event.clientY - previous.y, bounds.width, bounds.height);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const stopDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleWorkspaceKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const keyboardPan: Record<string, [number, number]> = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    };
    const delta = keyboardPan[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    updatePan(delta[0], delta[1], bounds.width, bounds.height);
  };

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || processing) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  const confirm = async () => {
    if (!image || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const output = await cropAndOptimizeResourceCover(file, crop);
      const croppedFile = new File(
        [output.blob],
        resourceCoverFileName(file.name, output.extension),
        { type: output.blob.type, lastModified: file.lastModified },
      );
      onConfirm(croppedFile, {
        width: output.width,
        height: output.height,
        extension: output.extension,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ครอปภาพไม่สำเร็จ กรุณาลองไฟล์ใหม่");
    } finally {
      setProcessing(false);
    }
  };

  const isFourThree = Boolean(image && isResourceCoverAspect(image.width, image.height));

  return (
    <section
      ref={panelRef}
      className="kru-cover-cropper"
      aria-labelledby="cover-cropper-heading"
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="kru-cover-cropper__heading">
        <div>
          <h4 id="cover-cropper-heading">จัดภาพปก 4:3</h4>
          <p>ลากภาพ ใช้ปุ่มลูกศร หรือปรับซูม แล้วตรวจตัวอย่างก่อนยืนยัน</p>
        </div>
        <span title={file.name}>{file.name}</span>
      </div>

      {!image && !error && <p role="status" aria-live="polite">กำลังเตรียมภาพ…</p>}
      {error && <p id="cover-cropper-error" role="alert" className="kru-cover-cropper__error">{error}</p>}
      {!image && (
        <div className="kru-cover-cropper__actions">
          <Button type="button" variant="secondary" icon={X} onClick={onCancel} disabled={processing}>ยกเลิก</Button>
        </div>
      )}

      {image && (
        <>
          {isFourThree && (
            <p className="kru-cover-cropper__ready" role="status">
              ภาพนี้ใกล้เคียง 4:3 ใช้ตำแหน่งเริ่มต้นได้เลย หรือปรับเพิ่มได้
            </p>
          )}
          <div className="kru-cover-cropper__layout">
            <div className="kru-cover-cropper__workspace">
              <div className="kru-cover-cropper__stage">
                <canvas
                  ref={workspaceRef}
                  width={800}
                  height={600}
                  role="img"
                  aria-label="พื้นที่ครอปภาพ 4 ต่อ 3 ลากหรือใช้ปุ่มลูกศรเพื่อจัดตำแหน่ง"
                  aria-describedby={error ? "cover-cropper-error" : "cover-cropper-instructions"}
                  tabIndex={0}
                  onPointerDown={startDrag}
                  onPointerMove={drag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onKeyDown={handleWorkspaceKeyDown}
                />
                <span className="kru-cover-cropper__grid" aria-hidden="true" />
                <span className="kru-cover-cropper__card-safe" aria-hidden="true" />
              </div>
              <p id="cover-cropper-instructions"><Move size={16} aria-hidden="true" /> เส้นประสีชมพูแสดงส่วน 16:10 ที่จะเห็นบนการ์ด</p>
            </div>

            <div className="kru-cover-cropper__previews" aria-label="ตัวอย่างภาพปก">
              <figure>
                <canvas ref={cardPreviewRef} width={320} height={200} aria-hidden="true" />
                <figcaption>การ์ดในคลังสื่อ <span>16:10</span></figcaption>
              </figure>
              <figure>
                <canvas ref={detailPreviewRef} width={320} height={240} aria-hidden="true" />
                <figcaption>หน้ารายละเอียด/หน้าแรก <span>4:3</span></figcaption>
              </figure>
            </div>
          </div>

          <div className="kru-cover-cropper__controls">
            <label htmlFor="resource-cover-zoom">
              <span><ZoomIn size={18} aria-hidden="true" /> ซูม <strong>{crop.zoom.toFixed(2)}×</strong></span>
              <input
                id="resource-cover-zoom"
                type="range"
                min={RESOURCE_COVER_MIN_ZOOM}
                max={RESOURCE_COVER_MAX_ZOOM}
                step={0.05}
                value={crop.zoom}
                onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))}
                disabled={processing}
              />
            </label>
          </div>

          <div className="kru-cover-cropper__actions">
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={() => setCrop(DEFAULT_RESOURCE_COVER_CROP)} disabled={processing}>
              รีเซ็ต
            </Button>
            <Button type="button" variant="secondary" icon={X} onClick={onCancel} disabled={processing}>ยกเลิก</Button>
            <Button type="button" icon={Check} onClick={() => void confirm()} loading={processing}>
              ยืนยันภาพปก
            </Button>
          </div>
          {processing && <p role="status" aria-live="polite" className="kru-cover-cropper__busy">กำลังครอปและบีบอัดภาพ…</p>}
        </>
      )}

      <style jsx>{`
        .kru-cover-cropper { width: 100%; margin-top: var(--sp-4); padding: var(--sp-5); border: 1px solid var(--border-brand); border-radius: var(--r-lg); background: var(--surface-card); box-shadow: var(--shadow-sm); display: grid; gap: var(--sp-5); outline: none; }
        .kru-cover-cropper:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 24%, transparent); }
        .kru-cover-cropper__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
        .kru-cover-cropper__heading h4 { margin: 0; font-size: var(--fs-18); color: var(--text-heading); }
        .kru-cover-cropper__heading p { margin: var(--sp-2) 0 0; color: var(--text-muted); font-size: var(--fs-14); }
        .kru-cover-cropper__heading > span { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-cover-cropper__layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 210px); gap: var(--sp-5); align-items: start; }
        .kru-cover-cropper__workspace { min-width: 0; }
        .kru-cover-cropper__stage { position: relative; width: 100%; max-width: 520px; aspect-ratio: 4 / 3; overflow: hidden; border: 2px solid var(--border-brand); border-radius: var(--r-lg); background: var(--surface-sunken); }
        .kru-cover-cropper__stage canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
        .kru-cover-cropper__stage canvas:active { cursor: grabbing; }
        .kru-cover-cropper__stage canvas:focus-visible { outline: 4px solid var(--focus-ring); outline-offset: -4px; }
        .kru-cover-cropper__grid { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to right, transparent 33.1%, rgba(255,255,255,.62) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.62) 66.7%, transparent 66.9%), linear-gradient(to bottom, transparent 33.1%, rgba(255,255,255,.62) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.62) 66.7%, transparent 66.9%); }
        .kru-cover-cropper__card-safe { position: absolute; inset: 8.333% 0; pointer-events: none; border-block: 2px dashed #f04f9b; box-shadow: 0 -100px 0 100px rgba(25,17,38,.24), 0 100px 0 100px rgba(25,17,38,.24); }
        .kru-cover-cropper__workspace > p { margin: var(--sp-3) 0 0; display: flex; gap: var(--sp-2); align-items: flex-start; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-cover-cropper__previews { display: grid; gap: var(--sp-4); }
        .kru-cover-cropper__previews figure { margin: 0; display: grid; gap: var(--sp-2); }
        .kru-cover-cropper__previews canvas { display: block; width: 100%; height: auto; border: 1px solid var(--border-default); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-cover-cropper__previews figcaption { color: var(--text-body); font-size: var(--fs-13); }
        .kru-cover-cropper__previews figcaption span { color: var(--text-muted); }
        .kru-cover-cropper__controls { padding: var(--sp-4); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-cover-cropper__controls label { display: grid; gap: var(--sp-2); color: var(--text-body); font-size: var(--fs-14); }
        .kru-cover-cropper__controls label > span { min-height: 44px; display: flex; align-items: center; gap: var(--sp-2); }
        .kru-cover-cropper__controls label strong { margin-left: auto; }
        .kru-cover-cropper__controls input { width: 100%; min-height: 44px; accent-color: var(--brand); cursor: pointer; }
        .kru-cover-cropper__actions { display: flex; justify-content: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-cover-cropper__actions :global(.kru-btn) { min-height: 44px; }
        .kru-cover-cropper__ready { margin: 0; padding: var(--sp-3) var(--sp-4); border-radius: var(--r-md); background: var(--status-success-bg); color: var(--status-success-fg); font-size: var(--fs-14); }
        .kru-cover-cropper__error { margin: 0; padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-cover-cropper__busy { margin: 0; text-align: right; color: var(--text-link); font-size: var(--fs-14); }
        @media (max-width: 640px) {
          .kru-cover-cropper { padding: var(--sp-4); }
          .kru-cover-cropper__heading, .kru-cover-cropper__layout { display: grid; grid-template-columns: 1fr; }
          .kru-cover-cropper__heading > span { max-width: 100%; }
          .kru-cover-cropper__previews { grid-template-columns: 1fr 1fr; }
          .kru-cover-cropper__actions { display: grid; }
          .kru-cover-cropper__actions :global(.kru-btn) { width: 100%; }
        }
        @media (max-width: 390px) {
          .kru-cover-cropper__previews { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
