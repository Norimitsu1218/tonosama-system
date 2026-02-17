export type StoreStatus = "CREATED" | "GENERATING" | "REVIEWING" | "PAID" | "LIVE";

export type StoreLifecycle = {
  id: string;
  ownerId: string;
  status: StoreStatus;
  previewToken?: string;
  isPublic?: boolean;
  publishedAtMs?: number;
};
