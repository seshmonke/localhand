import {
  formatRubles,
  kopecks,
  type DeliverySnapshot,
  type DeliveryStatus,
} from "@localhand/shared";
import { useId, type ReactNode } from "react";
import { Card } from "../layout/index.js";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  quoted: "Ожидает отправки",
  created: "Отправление создано",
  in_transit: "В пути",
  delivered: "Доставлено",
  canceled: "Отменено",
  manual: "Ручной трек",
  failed: "Ошибка доставки",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function periodLabel(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) {
    return min === max ? `${min} дн.` : `${min}–${max} дн.`;
  }
  const single = max ?? min;
  return single === null ? null : `${single} дн.`;
}

const dtClass = "font-mono text-[10px] uppercase tracking-wide text-ink/60";
const ddClass = "mt-1 break-words leading-relaxed";

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
  const headingId = useId();
  const period = delivery === null ? null : periodLabel(delivery.periodMin, delivery.periodMax);

  return (
    <Card as="section" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-mono text-[10px] uppercase tracking-[0.2em]">
        Доставка
      </h2>

      {delivery === null ? (
        <p className="mt-4 text-sm leading-relaxed">Доставка не оформлена</p>
      ) : (
        <>
          <div className="mt-4">
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span aria-hidden="true" className="size-2.5 bg-ink/40" />
              {DELIVERY_STATUS_LABELS[delivery.status]}
            </span>
          </div>

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Row label="Город">{delivery.cityName}</Row>
            <Row label={role === "buyer" ? "Пункт выдачи" : "ПВЗ получателя"}>
              {delivery.pointAddress}
            </Row>
            <Row label="Получатель">{delivery.recipientName}</Row>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className={dtClass}>Доставка</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {formatRubles(kopecks(delivery.priceKopecks))}
              </dd>
            </div>
            {period !== null ? <InlineRow label="Срок">{period}</InlineRow> : null}
            {delivery.tariffName !== null ? <Row label="Тариф">{delivery.tariffName}</Row> : null}
            {delivery.trackNumber !== null ? (
              <Row label="Трек">
                {`${delivery.carrier ?? "Перевозчик"} · ${delivery.trackNumber}`}
              </Row>
            ) : null}
            {delivery.lastStatusAt !== null ? (
              <InlineRow label="Обновлено">{formatDate(delivery.lastStatusAt)}</InlineRow>
            ) : null}
          </dl>
        </>
      )}
    </Card>
  );
}

/** One concise delivery line for order lists: price and status only. */
export function DeliveryListLine({ delivery }: { delivery: DeliverySnapshot }) {
  return (
    <p className="mt-2 break-words text-xs leading-relaxed text-ink/70">
      Доставка: {formatRubles(kopecks(delivery.priceKopecks))} ·{" "}
      {DELIVERY_STATUS_LABELS[delivery.status]}
    </p>
  );
}
