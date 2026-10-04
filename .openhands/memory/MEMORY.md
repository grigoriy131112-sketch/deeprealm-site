# Память: проект «VebFabrika» (чат 0c783)

> Сохранено из облачной беседы OpenHands **«Conversation 0c783»**
> (`0c78361a73054a84b7bd750029b94d0e`), остановленной 2026-10-04.
> Пользователь: `grigoriy131112@gmail.com` (GitHub: `grigoriy131112-sketch`).
> Полный архив (все файлы + траектория 4847 событий): папка `workspace/`
> и `trajectory/` в этом же репозитории. Живой снимок также лежит в
> `deeprealm-site/.openhands/memory/`.

## О чём проект

Пользователь (псевдоним **Гриб**) делает сайты на заказ и ведёт Telegram-канал
**@vebfabric** (`https://t.me/vebfabric`). В чате 0c783 он вместе с агентом:
писал посты и статьи, генерировал картинки, создавал и хостил сайты,
продвигал канал. Оплата — Telegram-звёзды; цены маленькие (пользователю
ещё нет 14 лет, хочет зарабатывать сам).

## Репозитории и живые сайты (GitHub Pages, хостинг не зависит от песочницы)

- `grigoriy131112-sketch/deeprealm-site` — сайт Deeprealm (RP-чат) и
  «Пожиратель Пустоты». Pages из папки `docs/`.
  https://grigoriy131112-sketch.github.io/deeprealm-site/
- `grigoriy131112-sketch/volna` — сайт-дневник «Волна». Файлы в корне.
  https://grigoriy131112-sketch.github.io/volna/
- `grigoriy131112-sketch/logos` — блог «Логос». Pages из ветки `gh-pages`,
  сборка в `docs/`.
  https://grigoriy131112-sketch.github.io/logos/
- `grigoriy131112-sketch/Grimhollow` — Node/Express проект (RP-чат).
- `-_` и `-` — пустые репозитории, созданы по ошибке (кириллица в имени
  вырезалась). Удалить вручную.

## Ограничения GITHUB_TOKEN (интеграция GitHub App id 165401575, доступ selected)

- НЕ может создавать/переименовывать/удалять репозитории (403).
- НЕ может добавлять коллабораторов (403).
- НЕ может включать GitHub Pages через API (403) — пользователь делает вручную:
  Settings → Pages.
- НЕ может создавать репозитории (`POST /user/repos` → 403).
- Может писать файлы в подключённые репозитории. В пустой репозиторий Git Data
  API не работает (409) — начинать через Contents API (`PUT /contents/<файл>`).
- Включить Discussions для Giscus тоже нельзя через API — только вручную.

## Инфраструктурные знания (из AGENTS.md проекта)

- Сайты хостятся на GitHub Pages: песочница засыпает и отдаёт 404, Pages — нет.
- «Логос»: статика собирается `tools/build_static.py` из `data/content.json`,
  workflow `.github/workflows/pages.yml` обновляет ветку `gh-pages`.
- Комментарии «Логоса» — через **Giscus** (обсуждения в GitHub Discussions).
- Мастерская «Логоса» (`/workshop`) хранит профиль и мысли в `localStorage`.
- Бриф для заказчиков — страница `/brief` (шаблоны, копирование кнопкой).
- Telegraph: токен в `preview-src/.telegraph-token`; картинки только по внешним
  ссылкам; правка статьи — `editPage`, не `createPage`.
- Проверка вёрстки — измерениями через headless `chromium` + CDP, а не на глаз.
- Heredoc в терминале не работает — файлы писать через file_editor.
- Pillow ставить отдельно: `pip install Pillow`.

## Безопасность

- **Не публиковать** `preview-src/deploy_logos.py` — в нём зашит ключ сессии
  песочницы. Он исключён из архива.
- Секреты (`GITHUB_TOKEN`, `OPENHANDS_API_KEY`, токен Telegraph) не хранить в
  памяти и не коммитить.

## Как продолжить работу

1. Открыть новый чат — память загрузится автоматически.
2. Архив и исходники: `workspace/` в репозитории памяти
   `grigoriy131112-sketch/deeprealm-site/.openhands/memory/`.
3. Траектория целиком (все решения и команды): `trajectory/events.tar.gz`.
