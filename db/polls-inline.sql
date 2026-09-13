ALTER TABLE polls ADD COLUMN post_id uuid REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE polls ADD COLUMN message_id uuid REFERENCES messages(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX polls_post ON polls(post_id);
CREATE UNIQUE INDEX polls_message ON polls(message_id);
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT * FROM polls LOOP
  IF p.chat_id IS NULL THEN
   INSERT INTO posts(id,user_id,body,created_at) VALUES(p.id,p.owner_id,p.payload->>'question',p.created_at);
   UPDATE polls SET post_id=p.id WHERE id=p.id;
  ELSE
   INSERT INTO messages(id,conversation_id,user_id,body,created_at) VALUES(p.id,p.chat_id,p.owner_id,'Опрос',p.created_at);
   UPDATE polls SET message_id=p.id WHERE id=p.id;
  END IF;
 END LOOP;
END $$;
