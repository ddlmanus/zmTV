import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  lazy,
  Suspense,
} from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AppLogo } from "./AppLogo";
import { PageResetContext } from "./PageResetContext";
import { PersistentPage } from "./PersistentPage";
import { Toaster } from "@/components/ui/toaster";
import { UpdateBanner } from "./UpdateBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/useToast";
import { ApiKeyDialog } from "@/components/shared/ApiKeyDialog";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
// Lazy-load all persistent pages — only loaded when first visited
const LazyVideoEnhancerPage = lazy(() =>
  import("@/pages/VideoEnhancerPage").then((m) => ({
    default: m.VideoEnhancerPage,
  })),
);
const LazyVideoWatermarkRemoverPage = lazy(() =>
  import("@/pages/VideoWatermarkRemoverPage").then((m) => ({
    default: m.VideoWatermarkRemoverPage,
  })),
);
const LazyVideoEraserPage = lazy(() =>
  import("@/pages/VideoEraserPage").then((m) => ({
    default: m.VideoEraserPage,
  })),
);
const LazyVideoFpsIncreaserPage = lazy(() =>
  import("@/pages/VideoFpsIncreaserPage").then((m) => ({
    default: m.VideoFpsIncreaserPage,
  })),
);
const LazyImageEnhancerPage = lazy(() =>
  import("@/pages/ImageEnhancerPage").then((m) => ({
    default: m.ImageEnhancerPage,
  })),
);
const LazyImageColorizerPage = lazy(() =>
  import("@/pages/ImageColorizerPage").then((m) => ({
    default: m.ImageColorizerPage,
  })),
);
const LazyImageWatermarkRemoverPage = lazy(() =>
  import("@/pages/ImageWatermarkRemoverPage").then((m) => ({
    default: m.ImageWatermarkRemoverPage,
  })),
);
const LazyBackgroundRemoverPage = lazy(() =>
  import("@/pages/BackgroundRemoverPage").then((m) => ({
    default: m.BackgroundRemoverPage,
  })),
);
const LazyImageEraserPage = lazy(() =>
  import("@/pages/ImageEraserPage").then((m) => ({
    default: m.ImageEraserPage,
  })),
);
const LazySegmentAnythingPage = lazy(() =>
  import("@/pages/SegmentAnythingPage").then((m) => ({
    default: m.SegmentAnythingPage,
  })),
);
const LazyZImagePage = lazy(() =>
  import("@/pages/ZImagePage").then((m) => ({ default: m.ZImagePage })),
);
const LazyVideoConverterPage = lazy(() =>
  import("@/pages/VideoConverterPage").then((m) => ({
    default: m.VideoConverterPage,
  })),
);
const LazyAudioConverterPage = lazy(() =>
  import("@/pages/AudioConverterPage").then((m) => ({
    default: m.AudioConverterPage,
  })),
);
const LazyImageConverterPage = lazy(() =>
  import("@/pages/ImageConverterPage").then((m) => ({
    default: m.ImageConverterPage,
  })),
);
const LazyMediaTrimmerPage = lazy(() =>
  import("@/pages/MediaTrimmerPage").then((m) => ({
    default: m.MediaTrimmerPage,
  })),
);
const LazyMediaMergerPage = lazy(() =>
  import("@/pages/MediaMergerPage").then((m) => ({
    default: m.MediaMergerPage,
  })),
);
const LazyFaceEnhancerPage = lazy(() =>
  import("@/pages/FaceEnhancerPage").then((m) => ({
    default: m.FaceEnhancerPage,
  })),
);
const LazyFaceSwapperPage = lazy(() =>
  import("@/pages/FaceSwapperPage").then((m) => ({
    default: m.FaceSwapperPage,
  })),
);
const LazyHistoryPage = lazy(() =>
  import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);
const LazyXiaohongshuGeneratorPage = lazy(() =>
  import("@/pages/XiaohongshuGeneratorPage").then((m) => ({
    default: m.XiaohongshuGeneratorPage,
  })),
);
const LazyWorkflowPage = lazy(() =>
  import("@/workflow/WorkflowPage").then((m) => ({ default: m.WorkflowPage })),
);

const isElectron = navigator.userAgent.toLowerCase().includes("electron");

// Hoisted constants — avoid re-creation on every render
const PERSISTENT_PATHS = [
  "/history",
  "/xiaohongshu",
  "/free-tools/video-enhancer",
  "/free-tools/video-watermark-remover",
  "/free-tools/video-eraser",
  "/free-tools/video-fps-increaser",
  "/free-tools/image-enhancer",
  "/free-tools/image-colorizer",
  "/free-tools/image-watermark-remover",
  "/free-tools/face-enhancer",
  "/free-tools/face-swapper",
  "/free-tools/background-remover",
  "/free-tools/image-eraser",
  "/free-tools/segment-anything",
  "/free-tools/video-converter",
  "/free-tools/audio-converter",
  "/free-tools/image-converter",
  "/free-tools/media-trimmer",
  "/free-tools/media-merger",
  "/z-image",
  "/workflow",
] as const;
const PERSISTENT_PATHS_SET = new Set<string>(PERSISTENT_PATHS);
const NOOP = () => {};

/** Check if a pathname matches a persistent path (exact or prefix for /playground) */
function isPersistentPath(pathname: string): boolean {
  if (PERSISTENT_PATHS_SET.has(pathname)) return true;
  return false;
}

/** Get the persistent path key for a pathname (normalizes route families) */
function getPersistentKey(pathname: string): string {
  return pathname;
}

// Helper to generate next key
let keyCounter = 0;
const nextKey = () => ++keyCounter;

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    return stored !== null ? stored === "true" : false;
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkflowRoute = location.pathname === "/workflow";
  const hasShownUpdateToast = useRef(false);

  // Track which persistent pages have been visited (to delay initial mount).
  // Using a ref + counter avoids creating a new Set on every navigation which
  // would cause every PersistentPage wrapper to re-render.
  const visitedPagesRef = useRef<Set<string>>(
    new Set(
      isPersistentPath(location.pathname)
        ? [getPersistentKey(location.pathname)]
        : [],
    ),
  );
  const [visitedVersion, setVisitedVersion] = useState(0);
  // Stable lookup: returns true if page was visited. The `visitedVersion`
  // dependency ensures the component re-renders when a NEW page is first visited.
  const hasVisited = useCallback(
    (path: string) => visitedPagesRef.current.has(path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visitedVersion],
  );
  // Track the last visited free-tools sub-page for navigation
  const [lastFreeToolsPage, setLastFreeToolsPage] = useState<string | null>(
    () =>
      location.pathname.startsWith("/free-tools/") ? location.pathname : null,
  );
  // Track keys for each page to force remount when reset
  const [pageKeys, setPageKeys] = useState<Record<string, number>>({});

  // Reset a persistent page by changing its key (forces remount)
  const resetPage = useCallback((path: string) => {
    setPageKeys((prev) => ({
      ...prev,
      [path]: nextKey(),
    }));
  }, []);

  // Track visits to persistent pages and last visited free-tools page
  useEffect(() => {
    if (isPersistentPath(location.pathname)) {
      const key = getPersistentKey(location.pathname);
      // Track for lazy mounting — only bump version when truly new
      if (!visitedPagesRef.current.has(key)) {
        visitedPagesRef.current.add(key);
        startTransition(() => {
          setVisitedVersion((v) => v + 1);
        });
      }
      // Track last visited for sidebar navigation (only for free-tools sub-pages)
      if (location.pathname.startsWith("/free-tools/")) {
        setLastFreeToolsPage(location.pathname);
      }
    } else if (location.pathname === "/free-tools") {
      setLastFreeToolsPage(null);
    }
  }, [location.pathname]);

  // mainRef kept for potential future use
  const mainRef = useRef<HTMLElement>(null);

  // Listen for update availability on startup
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    const unsubscribe = window.electronAPI.onUpdateStatus((status) => {
      if (status.status === "available" && !hasShownUpdateToast.current) {
        hasShownUpdateToast.current = true;
        const version = (status as { version?: string }).version;
        toast({
          title: "Update Available",
          description: version
            ? `Version ${version} is ready to download`
            : "A new version is available",
          action: (
            <ToastAction altText="View" onClick={() => navigate("/settings")}>
              View
            </ToastAction>
          ),
        });
      }
    });

    return unsubscribe;
  }, [navigate]);

  return (
    <PageResetContext.Provider value={{ resetPage }}>
      <TooltipProvider>
        <div
          className={cn(
            "playground-shell flex flex-col h-screen overflow-hidden relative",
          )}
        >
          {/* Fixed titlebar — draggable region for macOS & Windows (Electron only) */}
          {isElectron && (
            <div className="h-8 min-h-[32px] flex items-center justify-center bg-background electron-drag select-none shrink-0 relative z-50 electron-safe-right">
              {!/mac/i.test(navigator.platform) && (
                <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center electron-no-drag">
                  <AppLogo className="h-5 w-5 shrink-0" />
                </div>
              )}
            </div>
          )}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
              lastFreeToolsPage={lastFreeToolsPage}
              playgroundMode
              isMobileOpen={false}
              onMobileClose={NOOP}
            />
            <main
              ref={mainRef}
              className="relative flex-1 overflow-hidden md:pl-0"
              style={
                isWorkflowRoute
                  ? undefined
                  : {
                      background:
                        "linear-gradient(140deg, hsl(var(--playground-panel) / 0.56), hsl(var(--playground-canvas) / 0.92) 42%, hsl(var(--playground-tab-active) / 0.16))",
                    }
              }
            >
              <>
                {/* Regular routes via Outlet */}
                <div
                  className={
                    isPersistentPath(location.pathname)
                      ? "hidden"
                      : "h-full overflow-auto"
                  }
                >
                  <Outlet />
                </div>
                {/* Persistent pages — mounted on first visit, hidden via CSS when inactive */}
                <PersistentPage
                  visited={hasVisited("/history")}
                  active={location.pathname === "/history"}
                  pageKey={pageKeys["/history"] || 0}
                >
                  <LazyHistoryPage key={pageKeys["/history"] || 0} />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/xiaohongshu")}
                  active={location.pathname === "/xiaohongshu"}
                  pageKey={pageKeys["/xiaohongshu"] || 0}
                >
                  <LazyXiaohongshuGeneratorPage
                    key={pageKeys["/xiaohongshu"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/video-enhancer")}
                  active={location.pathname === "/free-tools/video-enhancer"}
                  pageKey={pageKeys["/free-tools/video-enhancer"] || 0}
                >
                  <LazyVideoEnhancerPage
                    key={pageKeys["/free-tools/video-enhancer"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/video-watermark-remover")}
                  active={
                    location.pathname === "/free-tools/video-watermark-remover"
                  }
                  pageKey={pageKeys["/free-tools/video-watermark-remover"] || 0}
                >
                  <LazyVideoWatermarkRemoverPage
                    key={pageKeys["/free-tools/video-watermark-remover"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/video-eraser")}
                  active={location.pathname === "/free-tools/video-eraser"}
                  pageKey={pageKeys["/free-tools/video-eraser"] || 0}
                >
                  <LazyVideoEraserPage
                    key={pageKeys["/free-tools/video-eraser"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/video-fps-increaser")}
                  active={
                    location.pathname === "/free-tools/video-fps-increaser"
                  }
                  pageKey={pageKeys["/free-tools/video-fps-increaser"] || 0}
                >
                  <LazyVideoFpsIncreaserPage
                    key={pageKeys["/free-tools/video-fps-increaser"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/image-enhancer")}
                  active={location.pathname === "/free-tools/image-enhancer"}
                  pageKey={pageKeys["/free-tools/image-enhancer"] || 0}
                >
                  <LazyImageEnhancerPage
                    key={pageKeys["/free-tools/image-enhancer"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/image-colorizer")}
                  active={location.pathname === "/free-tools/image-colorizer"}
                  pageKey={pageKeys["/free-tools/image-colorizer"] || 0}
                >
                  <LazyImageColorizerPage
                    key={pageKeys["/free-tools/image-colorizer"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/image-watermark-remover")}
                  active={
                    location.pathname === "/free-tools/image-watermark-remover"
                  }
                  pageKey={pageKeys["/free-tools/image-watermark-remover"] || 0}
                >
                  <LazyImageWatermarkRemoverPage
                    key={pageKeys["/free-tools/image-watermark-remover"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/face-enhancer")}
                  active={location.pathname === "/free-tools/face-enhancer"}
                  pageKey={pageKeys["/free-tools/face-enhancer"] || 0}
                >
                  <LazyFaceEnhancerPage
                    key={pageKeys["/free-tools/face-enhancer"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/face-swapper")}
                  active={location.pathname === "/free-tools/face-swapper"}
                  pageKey={pageKeys["/free-tools/face-swapper"] || 0}
                >
                  <LazyFaceSwapperPage
                    key={pageKeys["/free-tools/face-swapper"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/background-remover")}
                  active={
                    location.pathname === "/free-tools/background-remover"
                  }
                  pageKey={pageKeys["/free-tools/background-remover"] || 0}
                >
                  <LazyBackgroundRemoverPage
                    key={pageKeys["/free-tools/background-remover"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/image-eraser")}
                  active={location.pathname === "/free-tools/image-eraser"}
                  pageKey={pageKeys["/free-tools/image-eraser"] || 0}
                >
                  <LazyImageEraserPage
                    key={pageKeys["/free-tools/image-eraser"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/segment-anything")}
                  active={location.pathname === "/free-tools/segment-anything"}
                  pageKey={pageKeys["/free-tools/segment-anything"] || 0}
                >
                  <LazySegmentAnythingPage
                    key={pageKeys["/free-tools/segment-anything"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/z-image")}
                  active={location.pathname === "/z-image"}
                  pageKey={pageKeys["/z-image"] || 0}
                >
                  <LazyZImagePage key={pageKeys["/z-image"] || 0} />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/video-converter")}
                  active={location.pathname === "/free-tools/video-converter"}
                  pageKey={pageKeys["/free-tools/video-converter"] || 0}
                >
                  <LazyVideoConverterPage
                    key={pageKeys["/free-tools/video-converter"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/audio-converter")}
                  active={location.pathname === "/free-tools/audio-converter"}
                  pageKey={pageKeys["/free-tools/audio-converter"] || 0}
                >
                  <LazyAudioConverterPage
                    key={pageKeys["/free-tools/audio-converter"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/image-converter")}
                  active={location.pathname === "/free-tools/image-converter"}
                  pageKey={pageKeys["/free-tools/image-converter"] || 0}
                >
                  <LazyImageConverterPage
                    key={pageKeys["/free-tools/image-converter"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/media-trimmer")}
                  active={location.pathname === "/free-tools/media-trimmer"}
                  pageKey={pageKeys["/free-tools/media-trimmer"] || 0}
                >
                  <LazyMediaTrimmerPage
                    key={pageKeys["/free-tools/media-trimmer"] || 0}
                  />
                </PersistentPage>
                <PersistentPage
                  visited={hasVisited("/free-tools/media-merger")}
                  active={location.pathname === "/free-tools/media-merger"}
                  pageKey={pageKeys["/free-tools/media-merger"] || 0}
                >
                  <LazyMediaMergerPage
                    key={pageKeys["/free-tools/media-merger"] || 0}
                  />
                </PersistentPage>
                {/* Persistent Workflow page — overflow hidden (canvas) */}
                {hasVisited("/workflow") && (
                  <div
                    className={
                      location.pathname === "/workflow"
                        ? "h-full overflow-hidden"
                        : "hidden"
                    }
                    style={
                      location.pathname === "/workflow"
                        ? undefined
                        : { contentVisibility: "hidden" }
                    }
                  >
                    <Suspense
                      fallback={
                        location.pathname === "/workflow" ? (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                          </div>
                        ) : null
                      }
                    >
                      <LazyWorkflowPage key={pageKeys["/workflow"] || 0} />
                    </Suspense>
                  </div>
                )}
              </>
            </main>
            <Toaster />
            <UpdateBanner />
          </div>
        </div>
        <ApiKeyDialog />
      </TooltipProvider>
    </PageResetContext.Provider>
  );
}
