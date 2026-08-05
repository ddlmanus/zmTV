import React, { lazy, Suspense } from "react";

type DynamicComponent<P extends object> = React.ComponentType<P>;
type Loader<P extends object> = () => Promise<
  DynamicComponent<P> | { default: DynamicComponent<P> }
>;

export default function dynamic<P extends object>(
  loader: Loader<P>,
  options?: { loading?: () => React.ReactNode; ssr?: boolean },
): DynamicComponent<P> {
  const Lazy = lazy(async () => {
    const loaded = await loader();
    if (typeof loaded === "function") return { default: loaded };
    return loaded;
  });
  const LazyComponent = Lazy as unknown as DynamicComponent<P>;

  return function DynamicLoader(props: P) {
    const fallback = options?.loading ? options.loading() : null;
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
