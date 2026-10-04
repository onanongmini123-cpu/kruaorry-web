"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Move, RotateCcw, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui";
import {
  avatarCropRect,
  DEFAULT_AVATAR_CROP,
  panAvatarCrop,
  PROFILE_AVATAR_MAX_ZOOM,
  PROFILE_AVATAR_MIN_ZOOM,
  type AvatarCrop,
} from "@/lib/profileAvatar";

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

type Props = {
  file: File;
  busy: boolean;
  onConfirm: (crop: AvatarCrop) => void | Promise<void>;
  onCancel: () => void;
};

function panValueLabel(value: number, negative: string, positive: string): string {
  if (Math.abs(value) < 0.05) return "กึ่งกลาง";
  return `${value < 0 ? negative : positive} ${Math.round(Math.abs(value) * 100)}%`;
}

function drawCrop(canvas: HTMLCanvasElement | null, image: LoadedImage, crop: AvatarCrop): void {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = avatarCropRect(image.width, image.height, crop);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image.element,
    rect.x,
    rect.y,
    rect.size,
    rect.size,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

export function AvatarCropper({ file, busy, onConfirm, onCancel }: Props) {
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const circleCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (!active) return;
      if (nextImage.naturalWidth <= 0 || nextImage.naturalHeight <= 0) {
        setLoadError("อ่านขนาดภาพไม่ได้ กรุณาเลือกไฟล์ใหม่");
        return;
      }
      setCrop(DEFAULT_AVATAR_CROP);
      setImage({
        element: nextImage,
        width: nextImage.naturalWidth,
        height: nextImage.naturalHeight,
      });
      setLoadError(null);
    };
    nextImage.onerror = () => {
      if (active) setLoadError("เปิดไฟล์ภาพไม่ได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ใหม่");
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
    drawCrop(cropCanvasRef.current, image, crop);
    drawCrop(circleCanvasRef.current, image, crop);
  }, [crop, image]);

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const drag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = dragRef.current;
    if (!image || busy || !previous || previous.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const viewportSize = event.currentTarget.getBoundingClientRect().width;
    setCrop((current) => panAvatarCrop(
      current,
      deltaX,
      deltaY,
      viewportSize,
      image.width,
      image.height,
    ));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const rect = image ? avatarCropRect(image.width, image.height, crop) : null;
  const canPanX = Boolean(image && rect && image.width - rect.size > 0.5);
  const canPanY = Boolean(image && rect && image.height - rect.size > 0.5);

  return (
    <section className="kru-avatar-cropper" aria-labelledby="avatar-cropper-heading">
      <div className="kru-avatar-cropper__heading">
        <div>
          <h2 id="avatar-cropper-heading">จัดตำแหน่งรูปโปรไฟล์</h2>
          <p>ครอปเป็นสี่เหลี่ยม 1:1 แล้วดูตัวอย่างวงกลมก่อนบันทึก</p>
        </div>
        <span title={file.name}>{file.name}</span>
      </div>

      {!image && !loadError && <p role="status" aria-live="polite">กำลังเตรียมรูป…</p>}
      {loadError && <p role="alert" className="kru-avatar-cropper__error">{loadError}</p>}
      {!image && (
        <div className="kru-avatar-cropper__actions">
          <Button type="button" variant="secondary" icon={X} onClick={onCancel} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
      )}

      {image && (
        <>
          <div className="kru-avatar-cropper__previews">
            <div className="kru-avatar-cropper__workspace">
              <div className="kru-avatar-cropper__stage">
                <canvas
                  ref={cropCanvasRef}
                  width={512}
                  height={512}
                  role="img"
                  aria-label="พื้นที่ครอปรูปสี่เหลี่ยม ลากเพื่อจัดตำแหน่ง"
                  onPointerDown={startDrag}
                  onPointerMove={drag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                />
                <span className="kru-avatar-cropper__grid" aria-hidden="true" />
              </div>
              <p><Move size={16} aria-hidden="true" /> ลากรูปเพื่อจัดตำแหน่งในกรอบ</p>
            </div>

            <figure className="kru-avatar-cropper__circle-preview">
              <canvas ref={circleCanvasRef} width={192} height={192} aria-hidden="true" />
              <figcaption>ตัวอย่างรูปวงกลม</figcaption>
            </figure>
          </div>

          <div className="kru-avatar-cropper__controls">
            <label>
              <span><ZoomIn size={16} aria-hidden="true" /> ซูม <strong>{crop.zoom.toFixed(1)}×</strong></span>
              <input
                type="range"
                min={PROFILE_AVATAR_MIN_ZOOM}
                max={PROFILE_AVATAR_MAX_ZOOM}
                step={0.05}
                value={crop.zoom}
                onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))}
                disabled={busy}
              />
            </label>
            <label>
              <span>เลื่อนแนวนอน <strong>{panValueLabel(crop.positionX, "ซ้าย", "ขวา")}</strong></span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={crop.positionX}
                aria-valuetext={panValueLabel(crop.positionX, "ซ้าย", "ขวา")}
                onChange={(event) => setCrop((current) => ({ ...current, positionX: Number(event.target.value) }))}
                disabled={busy || !canPanX}
              />
            </label>
            <label>
              <span>เลื่อนแนวตั้ง <strong>{panValueLabel(crop.positionY, "ขึ้น", "ลง")}</strong></span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={crop.positionY}
                aria-valuetext={panValueLabel(crop.positionY, "ขึ้น", "ลง")}
                onChange={(event) => setCrop((current) => ({ ...current, positionY: Number(event.target.value) }))}
                disabled={busy || !canPanY}
              />
            </label>
          </div>

          <div className="kru-avatar-cropper__actions">
            <Button
              type="button"
              variant="ghost"
              icon={RotateCcw}
              onClick={() => setCrop(DEFAULT_AVATAR_CROP)}
              disabled={busy}
            >
              จัดกึ่งกลางใหม่
            </Button>
            <Button type="button" variant="secondary" icon={X} onClick={onCancel} disabled={busy}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              icon={Check}
              onClick={() => void onConfirm(crop)}
              loading={busy}
              aria-label={busy ? "กำลังบีบอัดและบันทึกรูปโปรไฟล์" : undefined}
            >
              ยืนยันและบันทึกรูป
            </Button>
          </div>
          {busy && <p className="kru-avatar-cropper__busy" role="status" aria-live="polite">กำลังบีบอัดและบันทึกรูป…</p>}
        </>
      )}

      <style jsx>{`
        .kru-avatar-cropper { width: 100%; padding-top: var(--sp-6); border-top: 1px solid var(--border-subtle); display: grid; gap: var(--sp-5); }
        .kru-avatar-cropper__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
        .kru-avatar-cropper__heading h2 { font-size: var(--fs-20); }
        .kru-avatar-cropper__heading p { margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-14); }
        .kru-avatar-cropper__heading > span { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-avatar-cropper__previews { display: grid; grid-template-columns: minmax(0, 1fr) 150px; align-items: center; gap: var(--sp-7); }
        .kru-avatar-cropper__workspace { min-width: 0; }
        .kru-avatar-cropper__stage { position: relative; width: min(100%, 360px); aspect-ratio: 1; overflow: hidden; border: 2px solid var(--border-brand); border-radius: var(--r-lg); background: var(--surface-sunken); box-shadow: var(--shadow-sm); }
        .kru-avatar-cropper__stage canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
        .kru-avatar-cropper__stage canvas:active { cursor: grabbing; }
        .kru-avatar-cropper__grid { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to right, transparent 33.1%, rgba(255,255,255,.6) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.6) 66.7%, transparent 66.9%), linear-gradient(to bottom, transparent 33.1%, rgba(255,255,255,.6) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.6) 66.7%, transparent 66.9%); box-shadow: inset 0 0 0 1px rgba(34,27,51,.12); }
        .kru-avatar-cropper__workspace > p { margin-top: var(--sp-3); display: flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--fs-13); }
        .kru-avatar-cropper__circle-preview { margin: 0; display: grid; justify-items: center; gap: var(--sp-3); }
        .kru-avatar-cropper__circle-preview canvas { width: 112px; height: 112px; border: 4px solid var(--white); border-radius: 999px; background: var(--surface-sunken); box-shadow: 0 0 0 1px var(--border-default), var(--shadow-md); }
        .kru-avatar-cropper__circle-preview figcaption { color: var(--text-muted); font-size: var(--fs-13); text-align: center; }
        .kru-avatar-cropper__controls { display: grid; gap: var(--sp-4); padding: var(--sp-5); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-avatar-cropper__controls label { display: grid; gap: var(--sp-2); color: var(--text-body); font-size: var(--fs-14); }
        .kru-avatar-cropper__controls label > span { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
        .kru-avatar-cropper__controls label > span :global(svg) { margin-right: auto; }
        .kru-avatar-cropper__controls input { width: 100%; accent-color: var(--brand); cursor: pointer; }
        .kru-avatar-cropper__controls input:disabled { cursor: not-allowed; opacity: .5; }
        .kru-avatar-cropper__actions { display: flex; justify-content: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-avatar-cropper__busy { color: var(--text-link); font-size: var(--fs-14); text-align: right; }
        .kru-avatar-cropper__error { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        @media (max-width: 620px) {
          .kru-avatar-cropper__heading { display: grid; }
          .kru-avatar-cropper__heading > span { max-width: 100%; }
          .kru-avatar-cropper__previews { grid-template-columns: 1fr; }
          .kru-avatar-cropper__stage { width: 100%; }
          .kru-avatar-cropper__actions { display: grid; }
          .kru-avatar-cropper__actions :global(.kru-btn) { width: 100%; }
        }
      `}</style>
    </section>
  );
}
