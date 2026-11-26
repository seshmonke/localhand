import { useQuery } from "@tanstack/react-query";
import { fetchCatalog, fetchProduct, fetchShop } from "./api.js";

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
