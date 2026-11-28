// Комментарий на русском не является runtime-текстом и сканером не считается.
export function CyrillicFixture() {
  const label = "Проверочная строка";
  const template = `Шаблон без подстановки`;
  return (
    <div title="Подсказка">
      {label}
      {template}
      Текст в JSX
    </div>
  );
}
