import { t } from "@localhand/i18n";
import {
  formatRubles,
  kopecks,
  type DeliverySnapshot,
  type DeliveryStatus,
} from "@localhand/shared";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../layout/index.js";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  quoted: t("delivery.status.quoted"),
  created: t("delivery.status.created"),
  in_transit: t("delivery.status.inTransit"),
  delivered: t("delivery.status.delivered"),
  canceled: t("delivery.status.canceled"),
  manual: t("delivery.status.manual"),
  failed: t("delivery.status.failed"),
};

type Translate = ReturnType<typeof useTranslation>["t"];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function periodLabel(min: number | null, max: number | null, t: Translate): string | null {
  if (min !== null && max !== null) {
    return min === max
      ? t("delivery.period.days", { count: min })
      : t("delivery.period.range", { min, max });
  }
  const single = max ?? min;
  return single === null ? null : t("delivery.period.days", { count: single });
}

const dtClass = "font-mono text-[10px] uppercase tracking-wide text-ink/60";
const ddClass = "mt-1 break-words leading-relaxed";
const MISSING_VALUE = t("delivery.missingValue");
const isMissing = (value: string) => value === MISSING_VALUE;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={dtClass}>{label}</dt>
      <dd className={ddClass}>{children}</dd>
    </div>
  );
}

function InlineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className={dtClass}>{label}</dt>
      <dd className="font-mono text-xs">{children}</dd>
    </div>
  );
}

/**
 * Read-only delivery snapshot for buyer and seller order pages. Provider ids,
 * status codes, tariff codes and point codes never reach the DOM.
 */
export function DeliverySummaryCard({
  delivery,
  role,
}: {
  delivery: DeliverySnapshot | null;
  role: "buyer" | "seller";
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const period = delivery === null ? null : periodLabel(delivery.periodMin, delivery.periodMax, t);
  const legacySnapshot =
    delivery !== null &&
    (isMissing(delivery.cityName) ||
      isMissing(delivery.pointAddress) ||
      isMissing(delivery.recipientName));

  return (
    <Card as="section" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-mono text-[10px] uppercase tracking-[0.2em]">
        {t("delivery.title")}
      </h2>

      {delivery === null ? (
        <p className="mt-4 text-sm leading-relaxed">{t("delivery.missing")}</p>
      ) : (
        <>
          <div className="mt-4">
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span aria-hidden="true" className="size-2.5 bg-ink/40" />
              {DELIVERY_STATUS_LABELS[delivery.status]}
            </span>
          </div>

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            {isMissing(delivery.cityName) ? null : (
              <Row label={t("delivery.city")}>{delivery.cityName}</Row>
            )}
            {isMissing(delivery.pointAddress) ? null : (
              <Row
                label={role === "buyer" ? t("delivery.point.buyer") : t("delivery.point.seller")}
              >
                {delivery.pointAddress}
              </Row>
            )}
            {isMissing(delivery.recipientName) ? null : (
              <Row label={t("delivery.recipient")}>{delivery.recipientName}</Row>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className={dtClass}>{t("delivery.price")}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {formatRubles(kopecks(delivery.priceKopecks))}
              </dd>
            </div>
            {period !== null ? <InlineRow label={t("delivery.period")}>{period}</InlineRow> : null}
            {delivery.tariffName !== null ? (
              <Row label={t("delivery.tariff")}>{delivery.tariffName}</Row>
            ) : null}
            {delivery.trackNumber !== null ? (
              <Row label={t("delivery.track")}>
                {`${delivery.carrier ?? t("delivery.carrierFallback")} · ${delivery.trackNumber}`}
              </Row>
            ) : null}
            {delivery.lastStatusAt !== null ? (
              <InlineRow label={t("delivery.updated")}>
                {formatDate(delivery.lastStatusAt)}
              </InlineRow>
            ) : null}
          </dl>
          {legacySnapshot ? (
            <p className="mt-4 border-l-[3px] border-ink/30 pl-2 text-sm leading-relaxed text-ink/70">
              {t("delivery.legacy")}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** One concise delivery line for order lists: price and status only. */
export function DeliveryListLine({ delivery }: { delivery: DeliverySnapshot }) {
  const { t } = useTranslation();
  return (
    <p className="mt-2 break-words text-xs leading-relaxed text-ink/70">
      {t("delivery.line")} {formatRubles(kopecks(delivery.priceKopecks))} ·{" "}
      {DELIVERY_STATUS_LABELS[delivery.status]}
    </p>
  );
}
