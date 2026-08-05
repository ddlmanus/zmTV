import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (url: string) => navigate(toHashlessRoute(url)),
      replace: (url: string) => navigate(toHashlessRoute(url), { replace: true }),
      back: () => window.history.back(),
      refresh: () => undefined,
    }),
    [navigate],
  );
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

function toHashlessRoute(url: string) {
  if (url.startsWith("/canvas")) return "/workflow";
  return url;
}
