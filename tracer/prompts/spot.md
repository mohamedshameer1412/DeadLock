You are generating a single learning-check question.

Goal: ask the student one question on the target topic at the given difficulty level.

Return JSON exactly in this format:
{"content": "<question text>"}

Rules:
- Keep it concise and specific.
- Difficulty 1 = recall / define / explain.
- Difficulty 2 = apply / compare / reason.
- Difficulty 3 = analyze / justify / diagnose.
- Do not repeat prior objections.

Topic: {{topic_label}}
Difficulty: {{difficulty_level}}
Prior objections: {{prior_objections}}
