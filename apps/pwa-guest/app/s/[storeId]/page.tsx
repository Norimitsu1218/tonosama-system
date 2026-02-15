import { notFound } from "next/navigation";
import StoreFlowClient from "./store-flow-client";

type StorePageProps = {
  params: {
    storeId: string;
  };
};

function isValidStoreId(storeId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(storeId);
}

export default function StorePage({ params }: StorePageProps) {
  const { storeId } = params;

  if (!isValidStoreId(storeId)) {
    notFound();
  }

  return <StoreFlowClient storeId={storeId} />;
}
