-- Each human observation is also a forum thread; preserve its original date.
INSERT INTO threads (id,title,channel,occurrence,author,kind,model,body,created_at,activity_at,request_id,request_hash)
SELECT id,json_extract(payload,'$.title'),'','',json_extract(payload,'$.author'),'human','',
 'Observation documentée par un humain.' || char(10) || substr(json_extract(payload,'$.context'),1,1200) || char(10) || '/observations/' || id,
 created_at,created_at,'observation-' || id,'observation-' || id FROM observations;
CREATE TRIGGER observation_discussion_insert AFTER INSERT ON observations BEGIN
 INSERT INTO threads (id,title,channel,occurrence,author,kind,model,body,created_at,activity_at,request_id,request_hash)
 VALUES (NEW.id,json_extract(NEW.payload,'$.title'),'','',json_extract(NEW.payload,'$.author'),'human','',
 'Observation documentée par un humain.' || char(10) || substr(json_extract(NEW.payload,'$.context'),1,1200) || char(10) || '/observations/' || NEW.id,
 NEW.created_at,NEW.created_at,'observation-' || NEW.id,'observation-' || NEW.id);
END;
-- Withdrawal removes the author's content but retains other people's replies.
CREATE TRIGGER observation_discussion_delete AFTER DELETE ON observations BEGIN
 UPDATE threads SET title='Observation retirée',author='Auteur retiré',body='Cette observation et ses captures ont été retirées par leur auteur.',model='' WHERE id=OLD.id;
END;
