"""E2E helper: put three practice questions (answer = option B) into the newest subject with the given name. Test databases only."""
import json
import sys
import time

from studyhub.db import open_db

name = sys.argv[1]
store = open_db()
db = store.db
sid = db.execute("SELECT id FROM subjects WHERE name=? ORDER BY id DESC LIMIT 1", (name,)).fetchone()["id"]
two = len(sys.argv) > 2 and sys.argv[2] == "two"      # "two": three questions in each of the first two topics that have passages
topics = db.execute("SELECT id, path FROM topics t WHERE subject_id=? AND EXISTS(SELECT 1 FROM chunks c WHERE c.topic_id=t.id) ORDER BY ordinal", (sid,)).fetchall() if two else []
topics = topics[:2] or [db.execute("SELECT id, path FROM topics WHERE subject_id=? ORDER BY ordinal LIMIT 1", (sid,)).fetchone()]
for topic in topics:
  for i, q in enumerate(["What does enqueue do?", "What does pop do?", "Which structure is first in, first out?"]):
      db.execute(
        "INSERT INTO mcq_items(subject_id,topic_id,topic_path,question,options,answer_index,explanation,quote,key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (sid, topic["id"], topic["path"], q, json.dumps(["Nothing", "The right answer", "Something else", "None of these"]), 1,
         "Because the material says so.", "The enqueue operation adds an element at the rear.", f"seed{topic['id']}-{i}", time.time()))
store.close()
