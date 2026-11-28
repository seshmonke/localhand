declare function t(key: string): string;

export function Button() {
  const label = t("probe.ok");
  return <button title="Подсказка">{label}Кнопка</button>;
}
