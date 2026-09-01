"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      homeHref="/community-live"
      homeLabel="Return to Community LIVE"
    />
  );
}
