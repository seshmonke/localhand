import { useQuery, type QueryClient } from "@tanstack/react-query";
import { fetchCatalog, fetchMe, fetchProduct, fetchSellerShop, fetchShop } from "./api.js";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export const sellerKeys = {
  all: ["seller"] as const,
  shop: ["seller", "shop"] as const,
};

export async function clearSellerQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: sellerKeys.all });
  queryClient.removeQueries({ queryKey: sellerKeys.all });
}

export function useMeQuery() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe,
    retry: false,
  });
}

export function useSellerShopQuery() {
  return useQuery({
    queryKey: sellerKeys.shop,
    queryFn: fetchSellerShop,
  });
}

export function useCatalogQuery() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: fetchCatalog,
  });
}

export function useShopQuery(slug: string) {
  return useQuery({
    queryKey: ["shop", slug],
    queryFn: () => fetchShop(slug),
    enabled: slug.length > 0,
  });
}

export function useProductQuery(id: number) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}
