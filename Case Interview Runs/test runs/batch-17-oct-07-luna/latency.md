# Batch 17 — Luna-none persona evaluation: latency (7 Oct 2026)

Text path, ms from turn start (no end-of-turn detection or TTS), per model turn. Luna runs 7 Oct; Sonnet comparison runs are the same personas from batches 11–13 (6 Oct) — different simulated candidates and a different day, so API speed drift applies (first token varied 0.74–1.37s median between runs minutes apart on 7 Oct).

| Persona | Luna turns | Luna first token / first speech / FIRST USEFUL / completion | Sonnet turns | Sonnet first token / first speech / FIRST USEFUL / completion |
|---|---|---|---|---|
| 18 Nikhil | 29 | 760 / 862 / **1106** / 1112 | 11 | 1403 / 1691 / **3038** / 3253 |
| 56 Devon | 11 | 763 / 982 / **1070** / 1285 | 9 | 1426 / 1451 / **2391** / 2388 |
| 9 Derek | 9 | 749 / 990 / **1421** / 1419 | 9 | 1352 / 1376 / **1855** / 2743 |
| 14 Jordan | 12 | 636 / 949 / **1160** / 1236 | 11 | 1344 / 1366 / **2022** / 2325 |
| 20 Connor | 13 | 698 / 855 / **1007** / 1353 | 8 | 1481 / 1482 / **2374** / 2882 |
| 58 Hugo | 8 | 732 / 899 / **1206** / 1425 | 9 | 1300 / 1403 / **1828** / 2355 |
| **All (median / p90)** | 82 | 730/1271 · 899/1437 · **1113/2000** · 1273/2126 | 57 | 1382/1873 · 1431/1894 · **2317/3219** · 2540/3578 |

Medians per persona; "All" pools every model turn. Quality not yet graded.
