"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUpload, completeUpload, failUpload, abortUpload, uploadStatus } from "@/app/actions/qrati";

/**
 * Replicates the SDK's high-level upload() three-step flow (create -> S3 PUT
 * -> complete) by hand: the API key must stay server-only, so create/complete
 * go through server actions while the S3 PUT — a plain fetch to a presigned
 * URL, no secret involved — happens straight from the browser.
 */
export function UploadForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setStatus("creating upload...");
    let created: Awaited<ReturnType<typeof createUpload>> | null = null;
    // Lets /uploads/status find this upload even if the create response never arrives.
    const clientUploadId = crypto.randomUUID();
    try {
      created = await createUpload({
        eventId,
        fileName: file.name,
        fileSize: file.size,
        rawContentType: file.type || "application/octet-stream",
        type: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
        caption: caption || undefined,
        clientUploadId,
      });

      setStatus("uploading to S3...");
      const put = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        await failUpload(created.contentId).catch(() => {});
        throw new Error(`S3 PUT failed with status ${put.status}`);
      }

      setStatus("completing...");
      await completeUpload({ contentId: created.contentId, key: created.key });
      const result = await uploadStatus({ contentId: created.contentId }).catch(() => null);
      setStatus(
        result
          ? `done — processing: ${result.processingStatus}, moderation: ${result.moderationStatus}. Redirecting...`
          : "done — redirecting to gallery..."
      );
      router.push(`/dashboard/events/${eventId}`);
      router.refresh();
    } catch (err) {
      if (!created) {
        // The create response may have been lost after the server stored the upload: ask by clientUploadId.
        const existing = await uploadStatus({ eventId, clientUploadId }).catch(() => null);
        if (existing) {
          setError(`Upload ${existing.contentId} was created (processing: ${existing.processingStatus}) but the response was lost.`);
          setStatus(null);
          return;
        }
      }
      if (created && err instanceof Error && !err.message.startsWith("S3 PUT failed")) {
        await abortUpload({ contentId: created.contentId, key: created.key }).catch(() => {});
      }
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex max-w-sm flex-col gap-3">
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="file:btn-outline text-muted-foreground text-sm file:mr-3 file:cursor-pointer"
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="preview" className="bg-muted max-h-64 rounded-md object-contain" />
      )}
      <input
        className="input-field"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <button type="submit" disabled={!file || Boolean(status)} className="btn-primary">
        Upload
      </button>
      {status && <p className="text-muted-foreground text-xs">{status}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </form>
  );
}
