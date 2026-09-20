"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

export default function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            networkMode: "always", // the service worker answers from its saved copy when offline, so do not pause the request
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error && "status" in error && [401, 403, 404, 400, 422, 429].includes(error.status)) && count < 2,
          },
        },
      }),
  );
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-center"
        closeButton
        style={{ "--normal-bg": "var(--surface)", "--normal-text": "var(--foreground)", "--normal-border": "var(--border)" }}
        toastOptions={{ style: { background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)" } }}
      />
    </QueryClientProvider>
  );
}
