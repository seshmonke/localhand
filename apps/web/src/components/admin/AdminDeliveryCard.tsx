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
import { useTranslation } from "react-i18next";
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

type Translate = ReturnType<typeof useTranslation>["t"];

function conflictMessage(code: string, t: Translate): string | null {
  switch (code) {
    case "delivery_tariff_mismatch":
      return t("admin.delivery.conflict.tariffMismatch");
    case "delivery_not_paid":
      return t("admin.delivery.notPaid");
    case "delivery_snapshot_missing":
      return t("admin.delivery.conflict.snapshotMissing");
    case "delivery_dimensions_missing":
      return t("admin.delivery.conflict.dimensionsMissing");
    case "delivery_already_created":
    case "delivery_already_exists":
      return t("admin.delivery.conflict.alreadyCreated");
    default:
      return null;
  }
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});
const formatDate = (value: string) => dateFormatter.format(new Date(value));
const periodLabel = (min: number | null, max: number | null, t: Translate) => {
  const single = max ?? min;
  if (single === null) return null;
  return min !== null && max !== null && min !== max
    ? t("delivery.period.range", { min, max })
    : t("delivery.period.days", { count: single });
};
const dtClass = "font-mono text-[10px] uppercase tracking-wide text-ink/60";
const itemClass =
  "flex flex-wrap items-baseline justify-between gap-2 border-t-[3px] border-ink/20 pt-2";

function errorMessage(error: unknown, fallback: string, t: Translate): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return t("common.sessionExpired.inline");
  if (error.status === 404) return t("admin.delivery.error.notFound");
  if (error.status === 502) return t("admin.delivery.error.providerUnavailable");
  return conflictMessage(error.code, t) ?? fallback;
}

type ManualFieldErrors = {
  carrier?: string;
  trackNumber?: string;
};

function validateManualTrack(
  input: {
    carrier: string;
    trackNumber: string;
  },
  t: Translate,
):
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
        ? t("admin.delivery.manual.trackInvalid")
        : field === "carrier"
          ? t("admin.delivery.manual.carrierRequired")
          : t("admin.delivery.manual.trackRequired");
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
  const { t } = useTranslation();
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
    actionError === t("common.sessionExpired.inline") ||
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
      setNotice(
        track === null
          ? t("admin.delivery.notice.created")
          : t("admin.delivery.notice.createdWithTrack", { track }),
      );
      void deliveryQuery.refetch();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.code === "delivery_already_created" || error.code === "delivery_already_exists")
      ) {
        setActionError(null);
        setNotice(t("admin.delivery.notice.alreadyExistsRefreshing"));
        void deliveryQuery.refetch();
        return;
      }
      setNotice(null);
      setActionError(errorMessage(error, t("admin.delivery.error.create"), t));
    },
  });

  const manualMutation = useMutation({
    mutationFn: (input: { carrier: string; trackNumber: string }) =>
      saveSellerManualTrack(orderId, input),
    onSuccess: (data) => {
      setNotice(t("admin.delivery.manual.saved"));
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
        setActionError(t("admin.delivery.manual.error.alreadyExists"));
        if (delivery !== null) {
          void deliveryQuery.refetch();
        }
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setManualBlocked(true);
        setActionError(t("admin.delivery.error.notFound"));
        return;
      }
      setActionError(errorMessage(error, t("admin.delivery.error.manual"), t));
    },
  });

  const track =
    current !== null && current.trackNumber !== null
      ? `${current.carrier ?? t("delivery.carrierFallback")} · ${current.trackNumber}`
      : null;
  const showQuoted = paid && current?.status === "quoted" && !sessionExpired && !notFound;
  const showEvents = paid && current !== null && current.status !== "quoted";
  const canRefresh = current?.status === "created" || current?.status === "in_transit";
  const period = current === null ? null : periodLabel(current.periodMin, current.periodMax, t);
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
        {t("delivery.title")}
      </h2>

      {current === null && paid ? (
        <>
          <p className="mt-4 text-sm leading-relaxed">{t("delivery.missing")}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink/60">
            {t("admin.delivery.manualUnavailableHint")}
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
            <Row label={t("delivery.city")}>{current.cityName}</Row>
            <Row label={t("delivery.point.seller")}>{current.pointAddress}</Row>
            <Row label={t("delivery.recipient")}>{current.recipientName}</Row>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className={dtClass}>{t("delivery.price")}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {formatRubles(kopecks(current.priceKopecks))}
              </dd>
            </div>
            {current.tariffName === null ? null : (
              <Row label={t("delivery.tariff")}>{current.tariffName}</Row>
            )}
            {period === null ? null : <Row label={t("delivery.period")}>{period}</Row>}
            {track === null ? null : <Row label={t("delivery.track")}>{track}</Row>}
          </dl>
        </>
      )}

      {paid ? null : <p className="mt-4 text-sm leading-relaxed">{t("admin.delivery.notPaid")}</p>}

      {sessionExpired ? <SessionExpiredState next={`/admin/orders/${orderId}`} /> : null}
      {queryError !== null && !sessionExpired ? (
        <div className="mt-4 flex flex-col gap-3">
          <FormError message={errorMessage(queryError, t("admin.delivery.error.load"), t)} />
          {!(queryError instanceof ApiError && queryError.status === 404) ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void deliveryQuery.refetch()}
              disabled={deliveryQuery.isFetching}
            >
              {deliveryQuery.isFetching ? t("admin.delivery.retrying") : t("common.retry")}
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
              ? t("admin.delivery.tariffs.calculating")
              : quota === undefined
                ? t("admin.delivery.tariffs.calculate")
                : t("admin.delivery.tariffs.refresh")}
          </Button>
          {tariffsQuery.isError && !sessionExpired ? (
            <FormError
              message={errorMessage(tariffsQuery.error, t("admin.delivery.error.tariffs"), t)}
            />
          ) : null}
          {quota === undefined ? null : (
            <>
              <p className="text-sm leading-relaxed">
                {t("admin.delivery.tariffs.paid")}{" "}
                {paidName ?? t("admin.delivery.tariffs.fallback")} ·{" "}
                {formatRubles(kopecks(delivery?.priceKopecks ?? quota.paid.priceKopecks))}
              </p>
              <ul
                aria-label={t("admin.delivery.tariffs.list")}
                className="flex flex-col gap-2 text-sm"
              >
                {quota.tariffs.map((tariff) => (
                  <li key={tariff.tariffCode} className={itemClass}>
                    <span className="font-semibold">{tariff.tariffName}</span>
                    <span className="font-mono text-xs">
                      {periodLabel(tariff.periodMin, tariff.periodMax, t)} ·{" "}
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
                {createMutation.isPending
                  ? t("admin.delivery.create.pending")
                  : t("admin.delivery.create.action")}
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
            const result = validateManualTrack({ carrier, trackNumber }, t);
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
            {t("admin.delivery.manual.title")}
          </h3>
          <p className="text-sm leading-relaxed text-ink/70">
            {t("admin.delivery.manual.description")}
          </p>
          {manualFieldErrors.carrier !== undefined ||
          manualFieldErrors.trackNumber !== undefined ? (
            <p role="alert" className="text-sm font-semibold">
              {t("admin.delivery.manual.fieldsError")}
            </p>
          ) : null}
          <FormField
            id={carrierFieldId}
            label={t("admin.delivery.manual.carrier")}
            error={manualFieldErrors.carrier}
          >
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
            label={t("admin.delivery.manual.track")}
            hint={t("admin.delivery.manual.trackHint")}
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
                t("admin.delivery.manual.trackHint"),
                manualFieldErrors.trackNumber,
              )}
              className={fieldControlClass}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={manualMutation.isPending}>
            {manualMutation.isPending
              ? t("admin.delivery.manual.saving")
              : t("admin.delivery.manual.save")}
          </Button>
        </form>
      ) : null}

      {showEvents ? (
        <div className="mt-6 border-t-[3px] border-ink pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em]">
              {t("admin.delivery.history.title")}
            </h3>
            {canRefresh ? (
              <Button
                size="sm"
                variant="outline"
                className="h-11"
                onClick={() => void deliveryQuery.refetch()}
                disabled={deliveryQuery.isFetching}
              >
                {deliveryQuery.isFetching
                  ? t("admin.delivery.history.refreshing")
                  : t("admin.delivery.history.refresh")}
              </Button>
            ) : null}
          </div>
          {deliveryQuery.isPending ? (
            <output aria-live="polite" className="mt-3 block text-sm">
              {t("admin.delivery.history.loading")}
            </output>
          ) : events.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed">{t("admin.delivery.history.empty")}</p>
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
