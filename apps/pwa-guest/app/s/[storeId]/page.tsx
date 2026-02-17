import { notFound } from "next/navigation";
import StoreFlowClient from "./store-flow-client";
import { isValidStoreId } from "../../lib/store-id";

type StorePageProps = {
  params: {
    storeId: string;
  };
};

export default function StorePage({ params }: StorePageProps) {
  const { storeId } = params;

  if (!isValidStoreId(storeId)) {
    notFound();
  }

  return <StoreFlowClient storeId={storeId} />;
}
