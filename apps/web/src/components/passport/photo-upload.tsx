import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ASSET_PHOTOS_BUCKET, MAX_PHOTO_BYTES } from "@hospiledger/shared";
import type { AssetPhotoWithUrl, PhotoType } from "@hospiledger/shared";
import { Camera, TriangleAlert } from "lucide-react";

import { Badge } from "@hospiledger/ui/components/badge";
import { buttonVariants } from "@hospiledger/ui/components/button";
import { Skeleton } from "@hospiledger/ui/components/skeleton";
import { cn } from "@hospiledger/ui/lib/utils";

import { supabase } from "@/lib/supabase";
import { PHOTO_TYPE_HINT, PHOTO_TYPE_LABEL } from "@/lib/format";
import { trpc } from "@/utils/trpc";

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
    if (file.size > MAX_PHOTO_BYTES) {
      setLocalError(`Ukuran maksimal ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`);
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
    } catch (caught) {
      setLocalError(caught instanceof Error ? `Gagal mengunggah ${PHOTO_TYPE_LABEL[type].toLowerCase()}: ${caught.message}` : `Gagal mengunggah ${PHOTO_TYPE_LABEL[type].toLowerCase()}. Coba lagi.`);
    } finally {
      setUploading(false);
    }
  }

  const rejected = photo && !photo.qualityOk;
  const idle = !photo && !uploading;
  const inactive = disabled || uploading;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{PHOTO_TYPE_LABEL[type]}</p>
          <p className="truncate text-xs text-muted-foreground">{PHOTO_TYPE_HINT[type]}</p>
        </div>
        {photo?.qualityOk && (
          <Badge variant="outline" className="rounded-full border-transparent bg-accent text-xs text-accent-foreground">
            Tersimpan
          </Badge>
        )}
        {rejected && (
          <Badge variant="destructive" className="rounded-full">
            Ditolak
          </Badge>
        )}
      </div>

      {photo && (
        <img
          src={photo.signedUrl}
          alt={`Foto ${PHOTO_TYPE_LABEL[type].toLowerCase()} aset`}
          loading="lazy"
          decoding="async"
          className={cn("h-32 w-full rounded-xl object-cover ring-1 ring-foreground/10", uploading && "opacity-50")}
        />
      )}
      {!photo && (uploading ? <Skeleton className="h-32 w-full rounded-xl" /> : (
        <div className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Camera aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
          <p className="px-4 text-xs text-muted-foreground">Belum ada foto.</p>
        </div>
      ))}

      {rejected && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Foto ditolak: {photo.qualityReason ?? "kualitas tidak memenuhi syarat"}. Unggah foto yang lebih jelas.
          </span>
        </p>
      )}

      <label
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "max-sm:min-h-11 w-fit cursor-pointer max-sm:w-full rounded-full px-4",
          inactive && "pointer-events-none opacity-50",
        )}
      >
        {uploading ? "Mengunggah..." : photo ? "Ganti foto" : "Unggah foto"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={inactive}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </label>
      {localError && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{localError}</span>
        </p>
      )}
    </div>
  );
}
