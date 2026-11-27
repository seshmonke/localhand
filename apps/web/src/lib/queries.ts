import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { CatalogQuery } from "@localhand/shared";
import {
  fetchCatalog,
  fetchMe,
  fetchMyOrders,
  fetchOrder,
  fetchProduct,
  fetchSellerOrder,
  fetchSellerOrders,
  fetchSellerProducts,
  fetchSellerShop,
  fetchShop,
} from "./api.js";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export const sellerKeys = {
  all: ["seller"] as const,
  shop: ["seller", "shop"] as const,
  products: ["seller", "products"] as const,
  orders: ["seller", "orders"] as const,
  order: (id: number) => ["seller", "orders", id] as const,
};

export const orderKeys = {
  all: ["orders"] as const,
  mine: ["orders", "mine"] as const,
  detail: (id: number) => ["orders", "detail", id] as const,
};

export async function clearSellerQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: sellerKeys.all });
  queryClient.removeQueries({ queryKey: sellerKeys.all });
}

export async function clearBuyerQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: orderKeys.all });
  queryClient.removeQueries({ queryKey: orderKeys.all });
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

export function useSellerProductsQuery(enabled = true) {
  return useQuery({
    queryKey: sellerKeys.products,
    queryFn: fetchSellerProducts,
    enabled,
  });
}

export function useMyOrdersQuery() {
  return useQuery({
    queryKey: orderKeys.mine,
    queryFn: fetchMyOrders,
    retry: false,
  });
}

export function useOrderQuery(id: number) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => fetchOrder(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });
}

export function useSellerOrdersQuery(enabled = true) {
  return useQuery({
    queryKey: sellerKeys.orders,
    queryFn: fetchSellerOrders,
    enabled,
    retry: false,
  });
}

export function useSellerOrderQuery(id: number) {
  return useQuery({
    queryKey: sellerKeys.order(id),
    queryFn: () => fetchSellerOrder(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });
}

export function useCatalogQuery(query: CatalogQuery) {
  return useQuery({
    queryKey: ["catalog", query.q ?? "", query.sort, query.page, query.pageSize],
    queryFn: () => fetchCatalog(query),
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
