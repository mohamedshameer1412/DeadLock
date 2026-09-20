"""E2E helper: put three practice questions (answer = option B) into the newest subject with the given name. Test databases only."""
import json
import sys
import time

from studyhub.db import open_db

name = sys.argv[1]
store = open_db()
db = store.db
sid = db.execute("SELECT id FROM subjects WHERE name=? ORDER BY id DESC LIMIT 1", (name,)).fetchone()["id"]
topic = db.execute("SELECT id, path FROM topics WHERE subject_id=? ORDER BY ordinal LIMIT 1", (sid,)).fetchone()
for i, q in enumerate(["What does enqueue do?", "What does pop do?", "Which structure is first in, first out?"]):
    db.execute(
        "INSERT INTO mcq_items(subject_id,topic_id,topic_path,question,options,answer_index,explanation,quote,key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (sid, topic["id"], topic["path"], q, json.dumps(["Nothing", "The right answer", "Something else", "None of these"]), 1,
         "Because the material says so.", "The enqueue operation adds an element at the rear.", f"seed{i}", time.time()))
store.close()
