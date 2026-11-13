#!/usr/bin/env bash
# Скачивает шрифтовые PBF-файлы (глифы) для подписей карты.
#
# MapLibre запрашивает глифы по шаблону:
#   /tiles/fonts/<шрифт>/<начало>-<конец>.pbf   (диапазоны юникода по 256 кодов)
# Стиль карты (miniapps/*/src/mapStyle.js) использует один шрифт -
# Noto Sans Regular, поэтому качаем все 256 диапазонов только его.
#
# Файлы кладутся рядом с тайлами (kkr.pmtiles): osm/data/tiles - это том
# nginx из osm/docker-compose.osm.yml, ничего пересобирать не нужно.
#
# Запуск на сервере (из корня репозитория):
#   bash scripts/fetch_fonts.sh /root/pro/osm/data/tiles/fonts
# Повторный запуск безопасен: существующие файлы не перезапрашиваются.
set -euo pipefail

FONT="Noto Sans Regular"
DEST="${1:-osm/data/tiles/fonts}"
BASE="https://tiles.openfreemap.org/fonts"

mkdir -p "$DEST/$FONT"

ok=0
miss=0
for i in $(seq 0 255); do
  start=$((i * 256))
  end=$((start + 255))
  f="$DEST/$FONT/$start-$end.pbf"
  if [ -s "$f" ]; then
    ok=$((ok + 1))
    continue
  fi
  # Пробел в имени шрифта - URL-кодируем вручную.
  url="$BASE/Noto%20Sans%20Regular/$start-$end.pbf"
  if curl -fsSL --max-time 60 -o "$f" "$url"; then
    ok=$((ok + 1))
  else
    # Часть диапазонов в шрифте пуста - источник честно отдаёт 404.
    rm -f "$f"
    miss=$((miss + 1))
  fi
done

echo "диапазонов глифов на месте: $ok, пустых в шрифте (404): $miss"
# Здоровый полный шрифт даёт минимум 200 непустых диапазонов.
[ "$ok" -ge 200 ]
