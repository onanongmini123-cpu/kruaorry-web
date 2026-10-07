import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

// Phones need ~44px targets. These pin the shared pieces so a restyle cannot
// quietly shrink them again.
describe("touch target sizes", () => {
  it("small buttons grow to the full tap size on phones and touch screens", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@media \(max-width: 767px\), \(pointer: coarse\) \{\s*\.kru-btn--sm \{\s*min-height: var\(--tap-min\);/);
  });

  it("a resource card is one big target through its title link", () => {
    const css = read("src/components/ui/ResourceCard.css");
    expect(css).toMatch(/\.kru-resource-card \{\s*position: relative;/);
    expect(css).toMatch(/\.kru-resource-card__title a::after,\s*\.kru-resource-card__title button::after \{[^}]*inset: 0;/);
    // The save button must stay above the covering link.
    expect(css).toMatch(/\.kru-resource-card__save \{[^}]*z-index: 2;/);
  });

  it("the public top bar links are 44px tall", () => {
    expect(read("src/components/PublicTopBar.css")).toMatch(/\.kru-topbar__brand,\s*\.kru-topbar__action \{\s*min-height: var\(--tap-min, 44px\);/);
  });

  it("carousel dots have a 44px hit area around the small visible dot", () => {
    const source = read("src/app/landing/FeaturedResourceCarousel.tsx");
    expect(source).toMatch(/\.kru-featured-carousel__dots button \{\s*width: var\(--tap-min, 44px\);\s*height: var\(--tap-min, 44px\);/);
  });

  it("the library filter row never needs more than the phone/tablet width", () => {
    const css = read("src/app/resources/library.css");
    // Tablet layout uses flexible tracks only; fixed minimums start at desktop width.
    const tablet = css.slice(css.indexOf("@media (min-width: 768px)"), css.indexOf("@media (min-width: 1100px)"));
    expect(tablet).toContain("repeat(4, minmax(0, 1fr)) auto");
    expect(tablet).not.toMatch(/minmax\(\d+px/);
  });

  it("the member library sizes its filters by the space they really have", () => {
    const source = read("src/app/app/page.tsx");
    expect(source).toContain("container-type: inline-size");
    expect(source).toContain("@container kru-discovery (min-width: 900px)");
    expect(source).not.toMatch(/@media \(min-width: 900px\) \{\s*\.kru-discovery-controls/);
  });
});
