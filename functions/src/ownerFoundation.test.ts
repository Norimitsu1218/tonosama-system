import assert from "node:assert/strict";
import test from "node:test";
import { extractWebsiteFromText, isSafeSourceUrl, normalizeVisionFrames, parseSourceUrl } from "./ownerFoundation";

test("parseSourceUrl accepts only https", () => {
  assert.equal(parseSourceUrl("https://example.com")?.hostname, "example.com");
  assert.equal(parseSourceUrl("http://example.com"), null);
  assert.equal(parseSourceUrl("not a url"), null);
});

test("isSafeSourceUrl blocks known scraping domains", () => {
  const safe = parseSourceUrl("https://official.example.com");
  const blocked = parseSourceUrl("https://www.tabelog.com/tokyo/A1301/");
  const blockedSub = parseSourceUrl("https://shop.retty.me/foo");
  const blockedHp = parseSourceUrl("https://www.hotpepper.jp/strJ000000/");
  assert.equal(safe ? isSafeSourceUrl(safe) : false, true);
  assert.equal(blocked ? isSafeSourceUrl(blocked) : true, false);
  assert.equal(blockedSub ? isSafeSourceUrl(blockedSub) : true, false);
  assert.equal(blockedHp ? isSafeSourceUrl(blockedHp) : true, false);
});

test("extractWebsiteFromText extracts first safe https url", () => {
  const text = "Shop Name\nhttps://example.jp/menu\n03-1234-5678";
  assert.equal(extractWebsiteFromText(text), "https://example.jp/menu");
  assert.equal(extractWebsiteFromText("visit https://retty.me/abc"), null);
  assert.equal(extractWebsiteFromText("visit http://example.jp"), null);
});

test("normalizeVisionFrames accepts valid multimodal frame list", () => {
  const frames = normalizeVisionFrames([
    { kind: "food", name: "炙り鯖", price: 1200, tags: ["HUNGRY"], notes: "charcoal" },
    { kind: "drink", name: "純米吟醸", price: 850, tags: ["RELAX"] }
  ]);
  assert.ok(Array.isArray(frames));
  assert.equal(frames?.length, 2);
  assert.equal(frames?.[0]?.kind, "food");
});

test("normalizeVisionFrames rejects invalid frame list", () => {
  assert.equal(normalizeVisionFrames([{ kind: "food", price: 1000 }]), null);
  assert.equal(normalizeVisionFrames("invalid"), null);
});

test("normalizeVisionFrames trims blocks and keeps kind", () => {
  const frames = normalizeVisionFrames([{ kind: "drink", name: "  純米  ", notes: "  dry  " }]);
  assert.equal(frames?.[0]?.name, "純米");
  assert.equal(frames?.[0]?.kind, "drink");
  assert.equal(frames?.[0]?.notes, "dry");
});
