import { notFound } from "next/navigation";
import { isValidStoreId } from "../../../lib/store-id";
import InfoEntryClient from "./info-entry-client";

type InfoPageProps = {
  params: {
    storeHash: string;
  };
  searchParams?: {
    lang?: string;
  };
};

export default function InfoPage({ params, searchParams }: InfoPageProps) {
  const storeHash = params.storeHash;

  if (!isValidStoreId(storeHash)) {
    notFound();
  }

  return <InfoEntryClient storeHash={storeHash} initialLang={searchParams?.lang ?? null} />;
}
