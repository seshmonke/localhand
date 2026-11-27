import { normalizeRussianPhone } from "@localhand/shared";
import { Button } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, KeyRound, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  fieldControlClass,
  fieldDescribedBy,
  FormError,
  FormField,
} from "../components/FormField.js";
import { ApiError, requestCode, verifyCode } from "../lib/api.js";
import { authKeys, useMeQuery } from "../lib/queries.js";

const PHONE_HINT = "Российский мобильный: 10 цифр после +7. Пароль не нужен.";
const PHONE_PLACEHOLDER = "+7 ··· ···-··-··";

const SAFE_NEXT_ORIGIN = "http://local";

export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/admin";
  }

  let url: URL;
  try {
    url = new URL(raw, SAFE_NEXT_ORIGIN);
  } catch {
    return "/admin";
  }

  const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  if (url.origin !== SAFE_NEXT_ORIGIN || !isAdminPath) {
    return "/admin";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) {
    return phone;
  }
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function authErrorMessage(error: unknown, kind: "request" | "verify"): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "Слишком много запросов. Подождите минуту и попробуйте снова.";
    }
    if (error.status === 400) {
      return kind === "request"
        ? "Проверьте номер телефона — нужен российский мобильный."
        : "Код состоит из шести цифр.";
    }
    if (error.status === 401) {
      return "Код неверный или истёк. Запросите новый код.";
    }
    if (error.status >= 500) {
      return "Сервис временно недоступен. Попробуйте ещё раз.";
    }
  }

  return kind === "request"
    ? "Не удалось отправить код. Проверьте соединение и попробуйте снова."
    : "Не удалось проверить код. Проверьте соединение и попробуйте снова.";
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMeQuery();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  const requestCodeMutation = useMutation({
    mutationFn: requestCode,
    onSuccess: (data, variables) => {
      setSentPhone(variables.phone);
      setDevCode(data.devCode ?? null);
      setCode("");
      setCodeError(null);
      setFormError(null);
      setStep("code");
    },
    onError: (error) => {
      const message = authErrorMessage(error, "request");
      if (error instanceof ApiError && error.status === 400) {
        setPhoneError(message);
        return;
      }
      setFormError(message);
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: verifyCode,
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me, { user: data.user });
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
      navigate(next, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setCodeError(authErrorMessage(error, "verify"));
        return;
      }
      setFormError(authErrorMessage(error, "verify"));
    },
  });

  if (me.isSuccess) {
    return <Navigate to={next} replace />;
  }

  function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeRussianPhone(phone);
    if (!normalized) {
      setPhoneError("Введите российский мобильный номер: 10 цифр после +7.");
      return;
    }
    setPhoneError(null);
    setFormError(null);
    requestCodeMutation.mutate({ phone: normalized });
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Введите шесть цифр из сообщения.");
      return;
    }
    setCodeError(null);
    setFormError(null);
    verifyCodeMutation.mutate({ phone: sentPhone, code });
  }

  function handleChangePhone() {
    setStep("phone");
    setDevCode(null);
    setCode("");
    setCodeError(null);
    setFormError(null);
  }

  function handleResend() {
    setCodeError(null);
    setFormError(null);
    requestCodeMutation.mutate({ phone: sentPhone });
  }

  const requestPending = requestCodeMutation.isPending;
  const verifyPending = verifyCodeMutation.isPending;

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-2">
      <header className="flex min-h-16 items-center justify-between border-b-[3px] border-ink px-4 py-3 sm:px-6 lg:hidden">
        <Link to="/" className="font-display text-lg font-extrabold uppercase tracking-tight">
          Local Hand
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />В каталог
        </Link>
      </header>

      <main className="flex flex-1 items-center px-4 py-10 sm:px-6 lg:justify-end lg:px-12 lg:py-16">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="hidden min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4 hover:text-accent-red lg:inline-flex"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />В каталог
          </Link>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red lg:mt-12">
            Кабинет продавца
          </p>
          <h1 className="mt-3 text-balance font-display text-4xl uppercase leading-[0.95] sm:text-5xl">
            Вход в кабинет
          </h1>
          <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed sm:text-base">
            Введите номер телефона — пришлём код. Пароль не нужен.
          </p>

          {step === "phone" ? (
            <form noValidate onSubmit={handlePhoneSubmit} className="mt-8 space-y-5">
              <FormField id="login-phone" label="Телефон" hint={PHONE_HINT} error={phoneError}>
                <input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={PHONE_PLACEHOLDER}
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    if (phoneError) {
                      setPhoneError(null);
                    }
                  }}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={fieldDescribedBy("login-phone", PHONE_HINT, phoneError)}
                  className={fieldControlClass}
                />
              </FormField>

              <FormError message={formError} />

              <Button type="submit" size="lg" className="w-full" disabled={requestPending}>
                {requestPending ? "Отправляем…" : "Получить код"}
                <ArrowRight aria-hidden="true" className="size-5" />
              </Button>

              <p className="flex items-start gap-2 border-t-[3px] border-ink pt-4 font-mono text-[10px] uppercase leading-relaxed tracking-wide text-ink/60">
                <Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Код действует 5 минут. Введите его на следующем шаге.
              </p>
            </form>
          ) : (
            <div className="mt-8">
              <output className="block text-sm leading-relaxed">
                Код отправлен на{" "}
                <strong className="font-mono font-semibold">{formatPhone(sentPhone)}</strong>.
              </output>

              {devCode ? (
                <output className="mt-4 block border-[3px] border-ink bg-accent-orange/15 p-3">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.2em]">
                    Дев-режим
                  </span>
                  <span className="mt-1 block text-sm">
                    Код из SMS:{" "}
                    <strong className="font-mono text-lg tracking-[0.2em]">{devCode}</strong>
                  </span>
                </output>
              ) : null}

              <form noValidate onSubmit={handleCodeSubmit} className="mt-6 space-y-5">
                <FormField
                  id="login-code"
                  label="Код из сообщения"
                  hint="Шесть цифр, действуют 5 минут."
                  error={codeError}
                >
                  <input
                    ref={codeInputRef}
                    id="login-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      if (codeError) {
                        setCodeError(null);
                      }
                    }}
                    aria-invalid={codeError ? true : undefined}
                    aria-describedby={fieldDescribedBy(
                      "login-code",
                      "Шесть цифр, действуют 5 минут.",
                      codeError,
                    )}
                    className={`${fieldControlClass} font-mono text-lg tracking-[0.3em]`}
                  />
                </FormField>

                <FormError message={formError} />

                <Button type="submit" size="lg" className="w-full" disabled={verifyPending}>
                  {verifyPending ? "Проверяем…" : "Войти"}
                  <ArrowRight aria-hidden="true" className="size-5" />
                </Button>

                <div className="flex flex-col gap-3 border-t-[3px] border-ink pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={handleChangePhone}
                    className="inline-flex min-h-11 items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4 hover:text-accent-red"
                  >
                    <KeyRound aria-hidden="true" className="size-4" />
                    Изменить номер
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={requestPending}
                    className="inline-flex min-h-11 items-center justify-center font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4 hover:text-accent-red disabled:opacity-50"
                  >
                    {requestPending ? "Отправляем…" : "Отправить код ещё раз"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <aside className="hidden flex-col justify-between bg-ink p-12 text-paper lg:flex">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-orange">
          Local Hand / Seller
        </p>
        <div>
          <p className="text-balance font-display text-5xl font-extrabold uppercase leading-[0.92] xl:text-6xl">
            Свой магазин в общей витрине
          </p>
          <ul className="mt-10 space-y-4 border-t-[3px] border-paper/40 pt-6 text-sm leading-relaxed text-paper/85">
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-mono text-accent-green">
                01
              </span>
              Один магазин на продавца: имя, адрес и описание.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-mono text-accent-green">
                02
              </span>
              Товары появятся в следующем обновлении кабинета.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="font-mono text-accent-green">
                03
              </span>
              Публикация — в один клик, снять с витрины можно в любой момент.
            </li>
          </ul>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wide text-paper/50">© 2026</p>
      </aside>
    </div>
  );
}
