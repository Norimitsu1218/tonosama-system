import assert from "node:assert/strict";
import test from "node:test";
import { buildPairingMatrix, createBundleVersion, type CatalogItem } from "./storeData";

test("buildPairingMatrix returns top drink ids for each food", () => {
  const foods: CatalogItem[] = [
    { id: "f1", name: "Spicy Bowl", price: 1000, tags: ["flavor:spicy", "temp:hot", "body:heavy"] },
    { id: "f2", name: "Light Salad", price: 700, tags: ["flavor:light", "temp:cold", "body:light"] }
  ];
  const drinks: CatalogItem[] = [
    { id: "d1", name: "Sweet Sake", price: 800, tags: ["flavor:sweet", "temp:cold", "body:light"] },
    { id: "d2", name: "Dry Sake", price: 900, tags: ["flavor:dry", "temp:hot", "body:heavy"] },
    { id: "d3", name: "Light Tea", price: 500, tags: ["flavor:light", "temp:cold", "body:light"] }
  ];

  const matrix = buildPairingMatrix(foods, drinks);
  assert.ok(Array.isArray(matrix.f1));
  assert.ok(Array.isArray(matrix.f2));
  assert.equal(matrix.f1.length, 3);
  assert.equal(matrix.f2.length, 3);
  assert.equal(matrix.f1[0], "d1");
  assert.equal(matrix.f2[0], "d3");
});

test("createBundleVersion is stable for same payload", () => {
  const payload = {
    paymentStatus: "PAID" as const,
    store: {
      name: "A",
      address: "B",
      sourceUrl: null,
      mapUrl: null,
      lpHeroImageUrl: null,
      lpHeroVideoUrl: null,
      businessRules: { supportsCashless: true, hasWifi: true, hasOtoshi: false },
      liabilityAccepted: { allergy: true, religion: true }
    },
    menuItems: [{ id: "f1", name: "Food", price: 1000, tags: ["HUNGRY"] }],
    drinks: [{ id: "d1", name: "Drink", price: 500, tags: ["RELAX"] }],
    pairings: { f1: ["d1"] }
  };
  const a = createBundleVersion(payload);
  const b = createBundleVersion(payload);
  assert.equal(a, b);
  assert.equal(a.length, 16);
});
