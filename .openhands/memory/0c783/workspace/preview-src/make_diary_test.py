"""Готовит тестовые копии diary.html без pwa.js (сервис-воркер перезагружает
страницу при первой установке и мешает замерам)."""
import re

DS = "/workspace/project/.work"
src = open(f"{DS}/diary.html", encoding="utf-8").read()
clean = re.sub(r'<script src="pwa\.js[^"]*"></script>\s*', '', src)
assert "pwa.js" not in clean, "pwa.js не удалён"
open(f"{DS}/diary-test.html", "w", encoding="utf-8").write(clean)
print("diary-test.html готов")
