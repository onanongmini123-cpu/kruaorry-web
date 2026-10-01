import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type RichMenuArea = {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: "uri"; label: string; uri: string } | { type: "message"; label: string; text: string };
};

type RichMenuConfig = {
  name: string;
  chatBarText: string;
  selected: boolean;
  size: { width: number; height: number };
  areas: RichMenuArea[];
};

const config = JSON.parse(
  readFileSync(new URL("../../../config/line-rich-menu.json", import.meta.url), "utf8"),
) as RichMenuConfig;

describe("LINE OA Rich Menu configuration", () => {
  it("uses the approved four public destinations without credentials", () => {
    const uriActions = config.areas.flatMap((area) => area.action.type === "uri" ? [area.action.uri] : []);
    const messageActions = config.areas.flatMap((area) => area.action.type === "message" ? [area.action.text] : []);

    expect(uriActions).toEqual([
      "https://kruaorry-web.vercel.app",
      "https://kruaorry-web.vercel.app/membership",
      "https://kruaorry-web.vercel.app/membership#how-to-pay",
    ]);
    expect(messageActions).toEqual(["ต้องการแจ้งปัญหาการใช้งาน…"]);
    expect(config.areas.map((area) => area.action.label)).toEqual([
      "เข้าชมเว็บไซต์",
      "สมัครสมาชิก",
      "แจ้งชำระเงิน",
      "รายงานปัญหา",
    ]);
    expect(JSON.stringify(config)).not.toMatch(/access[_-]?token|channel[_-]?secret/i);
  });

  it("covers the 2500 by 1686 canvas with one banner and three lower actions", () => {
    expect(config.size).toEqual({ width: 2500, height: 1686 });
    expect(config.areas.map((area) => area.bounds)).toEqual([
      { x: 0, y: 0, width: 2500, height: 843 },
      { x: 0, y: 843, width: 834, height: 843 },
      { x: 834, y: 843, width: 833, height: 843 },
      { x: 1667, y: 843, width: 833, height: 843 },
    ]);
  });
});
