"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommunityPublishForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "MEMBER">("MEMBER");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/community/communities/${encodeURIComponent(communityId)}/feed`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, body, visibility }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your post could not be published");

      setTitle("");
      setBody("");
      setOpen(false);
      setNotice("Published through SecurePay Community authority.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your post could not be published");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          className="rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand"
        >
          Write a Community post
        </button>
        {notice ? <p className="mt-2 text-xs text-status-good" role="status">{notice}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={publish} className="mt-4 rounded-lg border border-brand/20 bg-brand/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Write to this Community</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">The post is published deliberately through your current SecurePay identity.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-ink-faint">Close</button>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-ink-muted">
          Title
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-base text-ink"
          />
        </label>
        <label className="block text-xs font-medium text-ink-muted">
          Message
          <textarea
            required
            maxLength={5000}
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-base text-ink"
          />
        </label>
        <label className="block text-xs font-medium text-ink-muted">
          Who can see it
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as "PUBLIC" | "MEMBER")}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-base text-ink sm:w-auto"
          >
            <option value="MEMBER">Community members</option>
            <option value="PUBLIC">Public</option>
          </select>
        </label>
      </div>
      {notice ? <p className="mt-3 text-sm text-status-bad" role="alert">{notice}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Publishing…" : "Publish deliberately"}
      </button>
    </form>
  );
}
