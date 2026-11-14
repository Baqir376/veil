// Liquid Glass (after Apple's iOS 26 material): an SVG displacement filter used inside backdrop-filter
// bends what's behind the surface. Only Chromium supports url() filters in backdrop-filter, so we
// enable it there and fall back to a plain frosted blur everywhere else.
import { useEffect } from "react";

export function LiquidGlassDefs() {
  useEffect(() => {
    const brands = (navigator as any).userAgentData?.brands as { brand: string }[] | undefined;
    const chromium = brands ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) : /Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent);
    if (chromium) document.documentElement.classList.add("lg-ok");
  }, []);
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <filter id="liquid-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
