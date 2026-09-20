# Agent bake-off (real models, 2026-09-20)

Same material, same questions (14 for cloud: 8 answerable, 3 out of scope, 2 traps, 1 prompt injection; 8 for Ollama), one model at a time, cloud output capped at 1,200 tokens.
Every quote shown was checked to be word for word in the uploaded material. Cost is the OpenRouter credit actually used (total for all six models: about $0.14 of $10).

| model | answerable ok | others ok (no invented answer) | s per answer | practice questions kept | diagnostic-style (mixed difficulty) kept | tokens | credit used |
|---|---|---|---|---|---|---|---|
| deepseek/deepseek-v4-flash-0731 (OpenRouter) | 8/8 | 6/6 | 6.0 | 4/4 (94.0 s) | 5/6 (227.6 s) | 29829 | $0.026 |
| inclusionai/ling-3.0-flash (OpenRouter) | 8/8 | 6/6 | 4.5 | 4/4 (127.6 s) | 6/6 (174.4 s) | 28216 | $0.024 |
| mistralai/mistral-small-3.2-24b-instruct (OpenRouter) | 8/8 | 6/6 | 2.3 | 4/4 (17.5 s) | 5/6 (28.8 s) | 14864 | $0.007 |
| llama3.1:latest (local) | 5/5 | 3/3 | 26.6 | 4/4 (322.3 s) | 5/6 (399.1 s) | - | local |
| openai/gpt-oss-120b (OpenRouter) | 8/8 | 6/6 | 4.9 | 4/4 (37.8 s) | 5/6 (99.5 s) | 24739 | $0.020 |
| qwen/qwen3.7-flash (OpenRouter) | 8/8 | 6/6 | 12.8 | 4/4 (115.8 s) | 5/6 (167.2 s) | 52394 | $0.027 |
| z-ai/glm-5.3-flash (OpenRouter) | 8/8 | 6/6 | 5.2 | 4/4 (48.3 s) | 6/6 (91.8 s) | 31090 | $0.021 |

Reading it: every model answered every answerable question with verified quotes, refused the out-of-scope and trap questions, and ignored the prompt injection, so quality did not separate them.
Speed and cost did: mistral-small was fastest and cheapest by a wide margin, qwen3.7-flash used the most tokens and was slowest per answer, the local model is roughly ten times slower and took about ten minutes for the ten diagnostic questions.
The routing order in `studyhub/models.py` follows this table.
