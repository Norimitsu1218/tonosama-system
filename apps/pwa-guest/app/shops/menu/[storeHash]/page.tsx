import { notFound } from "next/navigation";
import StoreFlowClient from "../../../s/[storeId]/store-flow-client";
import { isValidStoreId } from "../../../lib/store-id";

type MenuPageProps = {
  params: {
    storeHash: string;
  };
};

export default function MenuPage({ params }: MenuPageProps) {
  const storeHash = params.storeHash;

  if (!isValidStoreId(storeHash)) {
    notFound();
  }

  return <StoreFlowClient storeId={storeHash} entryMode="post-info" />;
}
