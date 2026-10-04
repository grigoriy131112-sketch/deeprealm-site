# AGENTS.md — память чата 0c783

Инструкции и накопленные знания из беседы OpenHands «Conversation 0c783»
(`0c78361a73054a84b7bd750029b94d0e`), остановленной 2026-10-04.

Краткая выжимка — в `MEMORY.md`. Здесь — подробности для любого нового чата,
который продолжит работу над проектом.

## Что было сделано в 0c783

Проект «VebFabrika»: пользователь `grigoriy131112@gmail.com` (псевдоним Гриб)
делает сайты на заказ и ведёт Telegram-канал @vebfabric.

- Посты, статьи, пиар-материалы для канала.
- Генерация картинок (обложки, аватарки, иллюстрации) через Pillow.
- Создание и хостинг сайтов на GitHub Pages.
- Публикация статей в Telegraph.
- Продвижение канала, списки чатов для пиара.

## Репозитории

| Репозиторий | Что это | Хостинг |
|---|---|---|
| `grigoriy131112-sketch/deeprealm-site` | Deeprealm + «Пожиратель Пустоты» | Pages из `docs/` |
| `grigoriy131112-sketch/volna` | Дневник «Волна» | Pages из корня |
| `grigoriy131112-sketch/logos` | Блог «Логос» | Pages из `gh-pages` |
| `grigoriy131112-sketch/Grimhollow` | Node/Express RP-чат | — |

Живые адреса:
- https://grigoriy131112-sketch.github.io/deeprealm-site/
- https://grigoriy131112-sketch.github.io/volna/
- https://grigoriy131112-sketch.github.io/logos/

## Архив

- `workspace/` — все файлы, созданные в 0c783 (106 файлов), кроме
  `preview-src/deploy_logos.py` (в нём зашит ключ сессии).
- `trajectory/events.tar.gz` — полная траектория (4847 событий).
- `trajectory/meta.json` — метаданные беседы.

## Ограничения и подводные камни

- GITHUB_TOKEN (GitHub App, доступ selected) не создаёт репозитории, не
  добавляет коллабораторов и не включает Pages/Discussions — это вручную.
- Песочницы `*.prod-runtime.all-hands.dev` временные: засыпают, сайт 404.
  Постоянный хостинг — только GitHub Pages.
- `X-Session-API-Key` меняется после resume песочницы; свежий ключ брать из
  `GET /api/v1/sandboxes/search`.
- Heredoc в терминале не работает — писать файлы через file_editor.
- Браузерные проверки кэшируют CSS: перед прогоном включать
  `Network.setCacheDisabled`.
- Никогда не коммитить секреты.
