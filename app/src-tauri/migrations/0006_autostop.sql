-- Why a recording stopped without the Stop button: 'silence' (no one spoke for 15 minutes) or 'call_ended'
-- (after the meeting's end time, the other side went quiet). Null when the user stopped it.
alter table notes add column stop_reason text check (stop_reason is null or stop_reason in ('silence','call_ended'));
