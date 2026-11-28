import {
  DELIVERY_CARRIER_MAX_LENGTH,
  DELIVERY_TRACK_NUMBER_MAX_LENGTH,
  DeliveryManualTrackSchema,
  formatRubles,
  kopecks,
  type DeliverySnapshot,
  type OrderStatus,
  type SellerDeliveryResponse,
} from "@localhand/shared";
import { Button } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type ReactNode } from "react";
import { ApiError, createSellerShipment, saveSellerManualTrack } from "../../lib/api.js";
import {
  sellerKeys,
  useSellerDeliveryTariffsQuery,
  useSellerOrderDeliveryQuery,
} from "../../lib/queries.js";
import { fieldControlClass, fieldDescribedBy, FormError, FormField } from "../FormField.js";
import { Card } from "../layout/index.js";
import { DELIVERY_STATUS_LABELS } from "../orders/DeliverySummaryCard.js";
import { SessionExpiredState } from "./SessionExpiredState.js";

const PROVIDER_UNAVAILABLE = "СДЭК временно недоступен. Повторите позже.";
const SESSION_MESSAGE = "Сессия истекла. Войдите снова.";
const GENERIC_MANUAL_ERROR = "Не удалось сохранить трек. Проверьте соединение и повторите.";
const ALREADY_EXISTS_MESSAGE = "Отправление уже создано. Обновите страницу, чтобы увидеть трек.";
const TRACK_HINT = "Латинские буквы, цифры и дефис.";
const CONFLICT_MESSAGES: Record<string, string> = {
  delivery_tariff_mismatch:
    "Тариф изменился. Пересчитайте тарифы; цена доставки в заказе не меняется.",
  delivery_not_paid: "Доставка доступна после оплаты.",
  delivery_snapshot_missing: "В заказе нет данных доставки.",
  delivery_dimensions_missing:
    "У товаров не заполнены вес и габариты. Заполните их в карточке товара.",
  delivery_already_created: "Отправление уже создано. Обновите данные.",
  delivery_already_exists: "Отправление уже создано. Обновите данные.",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});
const formatDate = (value: string) => dateFormatter.format(new Date(value));
const periodLabel = (min: number | null, max: number | null) => {
  const single = max ?? min;
  if (single === null) return null;
  return min !== null && max !== null && min !== max ? `${min}–${max} дн.` : `${single} дн.`;
};
const dtClass = "font-mono text-[10px] uppercase tracking-wide text-ink/60";
const itemClass =
  "flex flex-wrap items-baseline justify-between gap-2 border-t-[3px] border-ink/20 pt-2";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return SESSION_MESSAGE;
  if (error.status === 404) return "Заказ не найден.";
  if (error.status === 502) return PROVIDER_UNAVAILABLE;
  return CONFLICT_MESSAGES[error.code] ?? fallback;
}

type ManualFieldErrors = {
  carrier?: string;
  trackNumber?: string;
};

function validateManualTrack(input: {
  carrier: string;
  trackNumber: string;
}):
  | { data: { carrier: string; trackNumber: string }; errors?: undefined }
  | { data?: undefined; errors: ManualFieldErrors } {
  const result = DeliveryManualTrackSchema.safeParse(input);
  if (result.success) {
    return { data: result.data };
  }

  const errors: ManualFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if ((field !== "carrier" && field !== "trackNumber") || errors[field] !== undefined) {
      continue;
    }
    errors[field] =
      issue.message === "invalid_track_number"
        ? "Только латинские буквы, цифры и дефис."
        : field === "carrier"
          ? "Укажите перевозчика."
          : "Укажите трек-номер.";
  }
  return { errors };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={dtClass}>{label}</dt>
      <dd className="mt-1 break-words leading-relaxed">{children}</dd>
    </div>
  );
}

export function AdminDeliveryCard({
  orderId,
  orderStatus,
  delivery,
}: {
  orderId: number;
  orderStatus: OrderStatus;
  delivery: DeliverySnapshot | null;
}) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const manualHeadingId = useId();
  const carrierFieldId = useId();
  const trackFieldId = useId();
  const carrierInputRef = useRef<HTMLInputElement>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);
  const paid = orderStatus === "paid";
  const deliveryQuery = useSellerOrderDeliveryQuery(orderId, paid && delivery !== null);
  const [tariffsRequested, setTariffsRequested] = useState(false);
  const tariffsQuery = useSellerDeliveryTariffsQuery(orderId, tariffsRequested);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackNumber, setTrackNumber] = useState("");
  const [manualFieldErrors, setManualFieldErrors] = useState<ManualFieldErrors>({});
  const [manualBlocked, setManualBlocked] = useState(false);

  const current = deliveryQuery.data?.delivery ?? delivery;
  const events = [...(deliveryQuery.data?.events ?? [])].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
  const queryError = deliveryQuery.isError ? deliveryQuery.error : null;
  const sessionExpired =
    (queryError instanceof ApiError && queryError.status === 401) ||
    actionError === SESSION_MESSAGE ||
    (tariffsQuery.error instanceof ApiError && tariffsQuery.error.status === 401);
  const notFound = queryError instanceof ApiError && queryError.status === 404;
  const quota = tariffsQuery.data;
  const paidName = quota?.tariffs.find(
    (tariff) => tariff.tariffCode === quota.paid.tariffCode,
  )?.tariffName;

  const createMutation = useMutation({
    mutationFn: (tariffCode: string) => createSellerShipment(orderId, tariffCode),
    onSuccess: (data) => {
      setActionError(null);
      queryClient.setQueryData<SellerDeliveryResponse>(
        sellerKeys.delivery(orderId),
        (previous) => ({ delivery: data.delivery, events: previous?.events ?? [] }),
      );
      const track = data.delivery.trackNumber;
      setNotice(track === null ? "Отправление создано." : `Отправление создано. Трек: ${track}.`);
      void deliveryQuery.refetch();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.code === "delivery_already_created" || error.code === "delivery_already_exists")
      ) {
        setActionError(null);
        setNotice("Отправление уже создано. Обновляем данные.");
        void deliveryQuery.refetch();
        return;
      }
      setNotice(null);
      setActionError(
        errorMessage(error, "Не удалось создать отправление. Проверьте соединение и повторите."),
      );
    },
  });

  const manualMutation = useMutation({
    mutationFn: (input: { carrier: string; trackNumber: string }) =>
      saveSellerManualTrack(orderId, input),
    onSuccess: (data) => {
      setNotice("Ручной трек сохранён.");
      setActionError(null);
      setManualFieldErrors({});
      queryClient.setQueryData<SellerDeliveryResponse>(
        sellerKeys.delivery(orderId),
        (previous) => ({ delivery: data.delivery, events: previous?.events ?? [] }),
      );
      void deliveryQuery.refetch();
    },
    onError: (error) => {
      setNotice(null);
      if (
        error instanceof ApiError &&
        (error.code === "delivery_already_exists" || error.code === "delivery_already_created")
      ) {
        setManualBlocked(true);
        setActionError(ALREADY_EXISTS_MESSAGE);
        if (delivery !== null) {
          void deliveryQuery.refetch();
        }
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setManualBlocked(true);
        setActionError("Заказ не найден.");
        return;
      }
      setActionError(errorMessage(error, GENERIC_MANUAL_ERROR));
    },
  });

  const track =
    current !== null && current.trackNumber !== null
      ? `${current.carrier ?? "Перевозчик"} · ${current.trackNumber}`
      : null;
  const showQuoted = paid && current?.status === "quoted" && !sessionExpired && !notFound;
  const showEvents = paid && current !== null && current.status !== "quoted";
  const canRefresh = current?.status === "created" || current?.status === "in_transit";
  const period = current === null ? null : periodLabel(current.periodMin, current.periodMax);
  const requestTariffs = () =>
    tariffsRequested ? void tariffsQuery.refetch() : setTariffsRequested(true);
  const manualAvailable =
    paid &&
    !sessionExpired &&
    !notFound &&
    !manualBlocked &&
    (current === null ||
      (current.providerOrderId === null &&
        current.status !== "manual" &&
        current.trackNumber === null));

  return (
    <Card as="section" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-mono text-[10px] uppercase tracking-[0.2em]">
        Доставка
      </h2>

      {current === null && paid ? (
        <>
          <p className="mt-4 text-sm leading-relaxed">Доставка не оформлена</p>
          <p className="mt-2 text-xs leading-relaxed text-ink/60">
            Город, ПВЗ и получатель не сохранены в заказе — трек вводится вручную, покупатель увидит
            только перевозчика и номер.
          </p>
        </>
      ) : null}

      {current === null ? null : (
        <>
          <div className="mt-4" aria-live="polite">
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span aria-hidden="true" className="size-2.5 bg-ink/40" />
              {DELIVERY_STATUS_LABELS[current.status]}
            </span>
          </div>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Row label="Город">{current.cityName}</Row>
            <Row label="ПВЗ получателя">{current.pointAddress}</Row>
            <Row label="Получатель">{current.recipientName}</Row>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className={dtClass}>Доставка</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {formatRubles(kopecks(current.priceKopecks))}
              </dd>
            </div>
            {current.tariffName === null ? null : <Row label="Тариф">{current.tariffName}</Row>}
            {period === null ? null : <Row label="Срок">{period}</Row>}
            {track === null ? null : <Row label="Трек">{track}</Row>}
          </dl>
        </>
      )}

      {paid ? null : (
        <p className="mt-4 text-sm leading-relaxed">Доставка доступна после оплаты.</p>
      )}

      {sessionExpired ? <SessionExpiredState next={`/admin/orders/${orderId}`} /> : null}
      {queryError !== null && !sessionExpired ? (
        <div className="mt-4 flex flex-col gap-3">
          <FormError message={errorMessage(queryError, "Не удалось загрузить доставку.")} />
          {!(queryError instanceof ApiError && queryError.status === 404) ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void deliveryQuery.refetch()}
              disabled={deliveryQuery.isFetching}
            >
              {deliveryQuery.isFetching ? "Повторяем…" : "Повторить"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showQuoted ? (
        <div className="mt-4 flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={requestTariffs}
            disabled={tariffsQuery.isFetching}
          >
            {tariffsQuery.isFetching
              ? "Считаем тарифы…"
              : quota === undefined
                ? "Рассчитать тарифы"
                : "Обновить тарифы"}
          </Button>
          {tariffsQuery.isError && !sessionExpired ? (
            <FormError
              message={errorMessage(
                tariffsQuery.error,
                "Не удалось рассчитать тарифы. Проверьте соединение и повторите.",
              )}
            />
          ) : null}
          {quota === undefined ? null : (
            <>
              <p className="text-sm leading-relaxed">
                Оплаченный тариф: {paidName ?? "тариф заказа"} ·{" "}
                {formatRubles(kopecks(delivery?.priceKopecks ?? quota.paid.priceKopecks))}
              </p>
              <ul aria-label="Доступные тарифы" className="flex flex-col gap-2 text-sm">
                {quota.tariffs.map((tariff) => (
                  <li key={tariff.tariffCode} className={itemClass}>
                    <span className="font-semibold">{tariff.tariffName}</span>
                    <span className="font-mono text-xs">
                      {periodLabel(tariff.periodMin, tariff.periodMax)} ·{" "}
                      {formatRubles(kopecks(tariff.priceKopecks))}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate(quota.paid.tariffCode)}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Создаём…" : "Создать отправление"}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {manualAvailable ? (
        <form
          className="mt-6 flex flex-col gap-3 border-t-[3px] border-ink pt-4"
          aria-labelledby={manualHeadingId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (manualMutation.isPending) {
              return;
            }
            const result = validateManualTrack({ carrier, trackNumber });
            if (result.data === undefined) {
              setManualFieldErrors(result.errors);
              setActionError(null);
              setNotice(null);
              (result.errors.carrier ? carrierInputRef : trackInputRef).current?.focus();
              return;
            }
            setManualFieldErrors({});
            setActionError(null);
            manualMutation.mutate(result.data);
          }}
        >
          <h3 id={manualHeadingId} className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Ручной трек
          </h3>
          <p className="text-sm leading-relaxed text-ink/70">
            Используйте, если отправление СДЭК точно не создано. После сохранения трек не меняется.
          </p>
          {manualFieldErrors.carrier !== undefined ||
          manualFieldErrors.trackNumber !== undefined ? (
            <p role="alert" className="text-sm font-semibold">
              Проверьте выделенные поля.
            </p>
          ) : null}
          <FormField id={carrierFieldId} label="Перевозчик" error={manualFieldErrors.carrier}>
            <input
              ref={carrierInputRef}
              id={carrierFieldId}
              name="carrier"
              type="text"
              autoComplete="organization"
              maxLength={DELIVERY_CARRIER_MAX_LENGTH}
              value={carrier}
              onChange={(event) => {
                setCarrier(event.target.value);
                if (manualFieldErrors.carrier) {
                  setManualFieldErrors((currentErrors) => ({
                    ...currentErrors,
                    carrier: undefined,
                  }));
                }
              }}
              aria-invalid={manualFieldErrors.carrier ? true : undefined}
              aria-describedby={fieldDescribedBy(
                carrierFieldId,
                undefined,
                manualFieldErrors.carrier,
              )}
              className={fieldControlClass}
            />
          </FormField>
          <FormField
            id={trackFieldId}
            label="Трек-номер"
            hint={TRACK_HINT}
            error={manualFieldErrors.trackNumber}
          >
            <input
              ref={trackInputRef}
              id={trackFieldId}
              name="trackNumber"
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={DELIVERY_TRACK_NUMBER_MAX_LENGTH}
              value={trackNumber}
              onChange={(event) => {
                setTrackNumber(event.target.value);
                if (manualFieldErrors.trackNumber) {
                  setManualFieldErrors((currentErrors) => ({
                    ...currentErrors,
                    trackNumber: undefined,
                  }));
                }
              }}
              aria-invalid={manualFieldErrors.trackNumber ? true : undefined}
              aria-describedby={fieldDescribedBy(
                trackFieldId,
                TRACK_HINT,
                manualFieldErrors.trackNumber,
              )}
              className={fieldControlClass}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={manualMutation.isPending}>
            {manualMutation.isPending ? "Сохраняем…" : "Сохранить трек"}
          </Button>
        </form>
      ) : null}

      {showEvents ? (
        <div className="mt-6 border-t-[3px] border-ink pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em]">История</h3>
            {canRefresh ? (
              <Button
                size="sm"
                variant="outline"
                className="h-11"
                onClick={() => void deliveryQuery.refetch()}
                disabled={deliveryQuery.isFetching}
              >
                {deliveryQuery.isFetching ? "Обновляем…" : "Обновить"}
              </Button>
            ) : null}
          </div>
          {deliveryQuery.isPending ? (
            <output aria-live="polite" className="mt-3 block text-sm">
              Загружаем историю…
            </output>
          ) : events.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed">Событий пока нет.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {events.map((event) => (
                <li key={`${event.statusCode}-${event.occurredAt}`} className={itemClass}>
                  <span className="font-semibold">{event.statusName}</span>
                  <time dateTime={event.occurredAt} className="font-mono text-xs">
                    {formatDate(event.occurredAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {notice === null ? null : (
        <output aria-live="polite" className="mt-4 block text-sm font-semibold">
          {notice}
        </output>
      )}
      {actionError === null || sessionExpired ? null : (
        <div className="mt-4">
          <FormError message={actionError} />
        </div>
      )}
    </Card>
  );
}
