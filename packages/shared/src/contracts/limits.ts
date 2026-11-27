/** PostgreSQL int4 upper bound: ids and item prices must never overflow the column. */
export const ORDER_ID_MAX = 2_147_483_647;
/** Order totals live in a bigint column and are only bounded by JS safe integers. */
export const ORDER_TOTAL_MAX_KOPECKS = Number.MAX_SAFE_INTEGER;
export const ORDER_MAX_ITEMS = 50;
