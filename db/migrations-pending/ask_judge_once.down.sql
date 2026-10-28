-- Rollback for ask_judge_once.sql. With the index gone, the claim insert errors on its ON CONFLICT target and the
-- judge is skipped (ask-judge.ts claimAskJudge): turns are unaffected.
DROP INDEX session_events_ask_judge_once;
