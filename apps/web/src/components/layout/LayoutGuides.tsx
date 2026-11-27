import { cn } from "@localhand/ui";
import { useLocation } from "react-router";

/**
 * Development-only 12-column overlay: `?guides=1`. It mirrors the page grid
 * (4 / 8 / 12 columns) and the 1440 container with 16/24/40 padding. The
 * overlay is disabled in production builds and is never linked from the UI.
 */
export function LayoutGuides() {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("guides") === "1";

  if (!import.meta.env.DEV || !requested) {
    return null;
  }

  return (
    <div
      data-testid="layout-guides"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    >
      <div className="mx-auto grid h-full w-full max-w-page grid-cols-4 gap-x-4 px-4 sm:px-6 md:grid-cols-8 lg:grid-cols-12 lg:gap-x-6 lg:px-10">
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            data-guide-column=""
            className={cn(
              "col-span-1 h-full border-x border-accent-red/50 bg-accent-red/10",
              index >= 4 && "hidden md:block",
              index >= 8 && "md:hidden lg:block",
            )}
          />
        ))}
      </div>
    </div>
  );
}
