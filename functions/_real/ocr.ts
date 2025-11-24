// functions/_real/ocr.ts
// REAL OCR adapter slot.
// - Keep interface stable: called from /jobs/ocr
// - Replace internals to your provider (Vision/Textract/etc.)
//
// env:
//   OCR_PROVIDER=vision|textract|mock
//   OCR_LANG_HINT=ja,en
//   OCR_TIMEOUT_MS=20000
//
// NOTE: This file is intentionally self-contained.

export type OcrLine = { text: string; confidence?: number };
export type OcrResult = {
  text: string;
  lines: OcrLine[];
  raw?: unknown;
};

type Env = Record<string, any>;

const timeout = (ms: number) =>
  new Promise<never>((_, rej) => setTimeout(() => rej(new Error("OCR timeout")), ms));

async function fetchImageBytes(inputUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(inputUrl);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return await res.arrayBuffer();
}

// -----------------------------
// Provider: Google Vision (HTTP JSON)
// -----------------------------
async function ocrVision(imageBytes: ArrayBuffer, env: Env): Promise<OcrResult> {
  // TODO: wire real endpoint + auth.
  const endpoint = env.VISION_ENDPOINT || "https://vision.googleapis.com/v1/images:annotate";
  const key = env.VISION_API_KEY; // Pages secret
  if (!key) throw new Error("VISION_API_KEY missing");

  const contentB64 = btoa(String.fromCharCode(...new Uint8Array(imageBytes)));
  const body = {
    requests: [
      {
        image: { content: contentB64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: {
          languageHints: (env.OCR_LANG_HINT || "ja").split(",").map((s: string) => s.trim()),
        },
      },
    ],
  };

  const res = await fetch(`${endpoint}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`vision error: ${res.status} ${await res.text()}`);
  const json = await res.json();

  const fullText =
    json?.responses?.[0]?.fullTextAnnotation?.text ||
    json?.responses?.[0]?.textAnnotations?.[0]?.description ||
    "";

  const lines: OcrLine[] =
    fullText
      .split("\n")
      .map((t: string) => t.trim())
      .filter(Boolean)
      .map((text: string) => ({ text })) || [];

  return { text: fullText, lines, raw: json };
}

// -----------------------------
// Provider: AWS Textract (HTTP JSON)
// -----------------------------
async function ocrTextract(_imageBytes: ArrayBuffer, _env: Env): Promise<OcrResult> {
  // TODO: implement AWS SigV4 and endpoint.
  throw new Error("Textract provider not wired yet");
}

// -----------------------------
// Provider: mock (for local/dev)
// -----------------------------
async function ocrMock(imageBytes: ArrayBuffer, _env: Env): Promise<OcrResult> {
  const size = imageBytes.byteLength;
  const text = `[mock-ocr] bytes=${size}\nサンプル品名 580\nサンプル品名 780`;
  const lines = text
    .split("\n")
    .filter(Boolean)
    .map((t) => ({ text: t.trim(), confidence: 0.5 }));
  return { text, lines, raw: { size } };
}

// -----------------------------
// Public entry
// -----------------------------
export async function runRealOcr(inputUrl: string, env: Env): Promise<OcrResult> {
  const provider = (env.OCR_PROVIDER || "mock").toLowerCase();
  const timeoutMs = Number(env.OCR_TIMEOUT_MS || 20000);
  const imageBytes = await fetchImageBytes(inputUrl);

  const job = (async () => {
    if (provider === "vision") return await ocrVision(imageBytes, env);
    if (provider === "textract") return await ocrTextract(imageBytes, env);
    return await ocrMock(imageBytes, env);
  })();

  return await Promise.race([job, timeout(timeoutMs)]);
}

export default { runRealOcr };
