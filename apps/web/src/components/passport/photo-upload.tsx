import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ASSET_PHOTOS_BUCKET } from "@hospiledger/shared";
import type { AssetPhotoWithUrl, PhotoType } from "@hospiledger/shared";

import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  front: "Tampak depan",
  side: "Tampak samping",
  back: "Tampak belakang",
  nameplate: "Label nameplate",
  damage: "Foto kerusakan (opsional)",
};

const ACCEPTED_CONTENT_TYPES: Record<string, true> = { "image/jpeg": true, "image/png": true, "image/webp": true };

export function PhotoUploadSlot({
  assetId,
  type,
  photo,
  disabled,
}: {
  assetId: string;
  type: PhotoType;
  photo: AssetPhotoWithUrl | undefined;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const createUploadUrl = useMutation(trpc.photos.createUploadUrl.mutationOptions());
  const confirmUpload = useMutation(trpc.photos.confirmUpload.mutationOptions());

  async function handleFile(file: File) {
    if (!(file.type in ACCEPTED_CONTENT_TYPES)) {
      setLocalError("Format harus JPEG, PNG, atau WebP.");
      return;
    }
    setLocalError(undefined);
    setUploading(true);
    try {
      const { storagePath, token } = await createUploadUrl.mutateAsync({
        assetId,
        type,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        fileSize: file.size,
      });
      const { error } = await supabase.storage.from(ASSET_PHOTOS_BUCKET).uploadToSignedUrl(storagePath, token, file);
      if (error) {
        setLocalError(`Gagal mengunggah foto: ${error.message}`);
        return;
      }
      await confirmUpload.mutateAsync({ assetId, type, storagePath });
      await queryClient.invalidateQueries({ queryKey: trpc.assets.get.queryOptions({ assetId }).queryKey });
    } finally {
      setUploading(false);
    }
  }

  const rejected = photo && !photo.qualityOk;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-black">{PHOTO_TYPE_LABELS[type]}</span>
        {photo?.qualityOk && (
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-strong">Tersimpan</span>
        )}
      </div>
      {photo && (
        <img
          src={photo.signedUrl}
          alt={PHOTO_TYPE_LABELS[type]}
          className="h-32 w-full rounded-xl object-cover"
        />
      )}
      {rejected && <p className="text-xs text-red-500">{photo.qualityReason ?? "Foto ditolak, coba unggah ulang."}</p>}
      <label className="inline-flex max-sm:min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-black/15 px-4 py-2 text-xs font-medium transition-colors duration-300 hover:border-black/40 aria-disabled:pointer-events-none aria-disabled:opacity-50">
        {uploading ? "Mengunggah..." : photo ? "Ganti foto" : "Unggah foto"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </label>
      {localError && <p className="text-xs text-red-500">{localError}</p>}
    </div>
  );
}
