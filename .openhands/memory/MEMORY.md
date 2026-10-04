# Память проекта

> Сохранено из беседы OpenHands «Conversation 0c783» (`0c78361a73054a84b7bd750029b94d0e`),
> остановленной 2026-10-04. Подробности — `AGENTS.md` и `.openhands/memory/0c783/`.

## Пользователь

- Email: `grigoriy131112@gmail.com`; GitHub: `grigoriy131112-sketch`; псевдоним «Гриб».
- Делает сайты на заказ, ведёт Telegram-канал @vebfabric (https://t.me/vebfabric).
- Оплата — Telegram-звёзды, цены небольшие.

## Сайты (постоянный хостинг — GitHub Pages)

- deeprealm-site — https://grigoriy131112-sketch.github.io/deeprealm-site/ (RP-чат Deeprealm, «Пожиратель Пустоты»)
- volna — https://grigoriy131112-sketch.github.io/volna/ (дневник «Волна»)
- logos — https://grigoriy131112-sketch.github.io/logos/ (блог «Логос»)

## Архив чата 0c783

- Локально: `.openhands/memory/0c783/` (файлы) и `trajectory/events.tar.gz`.
- На GitHub: ветка `openhands-memory` репозитория `deeprealm-site`, папка `.openhands/memory/`.

## Ограничения

- GITHUB_TOKEN (GitHub App, доступ selected): не создаёт репозитории, не добавляет коллабораторов, не включает Pages/Discussions — вручную.
- Песочницы `*.prod-runtime.all-hands.dev` временные; постоянный хостинг — GitHub Pages.
- Секреты не коммитить и не записывать в память.

## Последнее состояние

- 2026-10-04 починен баг Deeprealm «после проверь анкетолог думает и молчит»
  (зависший relay/Telegram без таймаута блокировал ответ игроку).
  Коммит `2db80c9` в `main` репозитория `deeprealm-site`; 142 теста проходят.
  Подробности — `AGENTS.md`.
- 2026-10-04 починено уведомление владельцу об анкете сотрудника (приходило без
  ответов и дважды) — коммит `9954ba7`.
- 2026-10-04 анкетолог принимает готовые анкеты, умеет собрать класс под готовую
  расу, добавлены вехи/специализации — коммит `bfa82ff`, 146 тестов проходят.
- Рабочая копия репозиториев: `/workspace/project/work/{deeprealm-site,volna,logos,Grimhollow}`.
- 2026-10-04 восстановлена беседа «Что такое ДнД?» (проект Grimhollow):
  поднята её песочница, выкачано и закоммичено незакоммиченное состояние карты
  мира (коммит `86aa17b` в `grigoriy131112-sketch/Grimhollow`). Архив беседы —
  `.openhands/memory/ff1ce2f0/`. GitHub Pages у Grimhollow пока не включён (404).
