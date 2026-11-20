"use client";

import * as React from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-6 py-16">
      <ErrorState
        className="w-full max-w-lg"
        title="Something went wrong"
        description="We hit an unexpected issue while rendering this page. Try again, or reload to continue."
        onRetry={() => {
          retry();
          window.location.reload();
        }}
      />
    </div>
  );
}