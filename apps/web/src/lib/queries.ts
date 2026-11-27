import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { CatalogQuery } from "@localhand/shared";
import {
  fetchCatalog,
  fetchMe,
  fetchMyOrders,
  fetchOrder,
  fetchOrderPayment,
  fetchProduct,
  fetchSellerOrder,
  fetchSellerOrderPayment,
  fetchSellerOrders,
  fetchSellerPaymentAccount,
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
  orderPayment: (id: number) => ["seller", "orders", id, "payment"] as const,
  paymentsAccount: ["seller", "payments", "account"] as const,
};

export const orderKeys = {
  all: ["orders"] as const,
  mine: ["orders", "mine"] as const,
  detail: (id: number) => ["orders", "detail", id] as const,
  payment: (id: number) => ["orders", "detail", id, "payment"] as const,
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

export function useSellerPaymentAccountQuery() {
  return useQuery({
    queryKey: sellerKeys.paymentsAccount,
    queryFn: fetchSellerPaymentAccount,
    retry: false,
  });
}

export type OrderPaymentQueryOptions = {
  enabled?: boolean;
  /** Poll every 3s while a return-from-provider flow is waiting for a result. */
  poll?: boolean;
};

export function useOrderPaymentQuery(id: number, options: OrderPaymentQueryOptions = {}) {
  return useQuery({
    queryKey: orderKeys.payment(id),
    queryFn: () => fetchOrderPayment(id),
    enabled: (options.enabled ?? true) && Number.isInteger(id) && id > 0,
    retry: false,
    refetchInterval: options.poll
      ? (query) => {
          const status = query.state.data?.payment?.status;
          return status === undefined || status === "pending" ? 3_000 : false;
        }
      : false,
  });
}

export function useSellerOrderPaymentQuery(id: number, enabled = true) {
  return useQuery({
    queryKey: sellerKeys.orderPayment(id),
    queryFn: () => fetchSellerOrderPayment(id),
    enabled: enabled && Number.isInteger(id) && id > 0,
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
