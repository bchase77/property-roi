# Claude Code Instructions

## Session Start Requirements

**IMPORTANT:** At the start of EVERY session, I must:

1. **Announce that I'm tracking prompts and work efforts**
2. **Update CLAUDE_CONVERSATION_LOG.md** with all user prompts word-for-word
3. **Update PROJECT_SUMMARY.md** with time estimates and work completed
4. **Continue logging throughout the entire session**

## Files to Maintain

- `CLAUDE_CONVERSATION_LOG.md` - Complete conversation history with prompts and responses
- `PROJECT_SUMMARY.md` - Project overview, time tracking, feature implementation status

## User Requirements

1. **Prompt Tracking:** User specifically requested: "Make a note to yourself every time you start to keep track of all my prompts and our work efforts. Tell me you are doing that every time you start." (Established 2025-10-26)

2. **Server Location Notice:** **EVERY TIME I MAKE A CHANGE, I MUST TELL THE USER WHERE TO FIND THE SERVER** (i.e., Vercel, localhost:3000, localhost:3001, etc.). This requirement was established on 2025-11-08 and must be followed for all future changes.

## Database Schema Change Protocol

**CRITICAL:** Before making any database schema changes (adding/removing/modifying tables or columns), always:

1. **Create a backup first** via Admin page → "Download Database Backup"
2. **Note in CLAUDE_CONVERSATION_LOG.md** that a backup was created before schema changes
3. **Test the schema change** thoroughly
4. **Create another backup** after successful migration

Schema changes may make old backups incompatible. Having a pre-migration backup ensures rollback capability if issues arise.