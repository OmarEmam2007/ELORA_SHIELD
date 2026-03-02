# ELORA Ecosystem — Master Commands Registry

This file lists **every command** across all ELORA micro-bots.

Format per command:
- **Command**: name / syntax
- **Type**: Prefix (`elora ...` / `!`) or Slash (`/`)
- **Description**: brief purpose

---

## 🛡️ ELORA SHIELD (Moderation & Security)

### Slash Commands (/)

- **`/ban`**
- **Type:** Slash
- **Description:** Ban a user (optionally with reason and delete-message window).

- **`/kick`**
- **Type:** Slash
- **Description:** Kick a user from the server.

- **`/timeout`**
- **Type:** Slash
- **Description:** Temporarily timeout (mute) a user for N minutes.

- **`/clear`**
- **Type:** Slash
- **Description:** Bulk delete messages (optionally filter by user/bots/contains).

- **`/warn add`**
- **Type:** Slash
- **Description:** Issue a warning to a user.

- **`/warn list`**
- **Type:** Slash
- **Description:** List warnings for a user.

- **`/warn clear`**
- **Type:** Slash
- **Description:** Clear all warnings for a user.

- **`/mod-config logs`**
- **Type:** Slash
- **Description:** Set moderation logs channel.

- **`/mod-config toggle`**
- **Type:** Slash
- **Description:** Enable/disable smart moderation filter.

- **`/mod-config whitelist-add`**
- **Type:** Slash
- **Description:** Add a safe word/phrase that will never be flagged.

- **`/mod-config whitelist-remove`**
- **Type:** Slash
- **Description:** Remove a safe word/phrase from whitelist.

- **`/mod-config whitelist-list`**
- **Type:** Slash
- **Description:** View the current anti-swear whitelist.

- **`/mod-config reset-warnings`**
- **Type:** Slash
- **Description:** Reset a user’s anti-swear warning counter.

- **`/mod-config threshold-set`**
- **Type:** Slash
- **Description:** Set warnings needed before timeout (anti-swear).

- **`/mod-config blacklist-add`**
- **Type:** Slash
- **Description:** Add a custom blocked term (anti-swear).

- **`/mod-config blacklist-remove`**
- **Type:** Slash
- **Description:** Remove a blocked term (anti-swear).

- **`/mod-config blacklist-list`**
- **Type:** Slash
- **Description:** List custom blocked terms.

- **`/mod-dashboard`**
- **Type:** Slash
- **Description:** Deploy the smart moderation dashboard panel to the current channel.

- **`/security logs`**
- **Type:** Slash
- **Description:** Set the security logs channel.

- **`/security toggle`**
- **Type:** Slash
- **Description:** Enable/disable Anti-Nuke.

- **`/security antilink`**
- **Type:** Slash
- **Description:** Enable/disable Anti-Link (block invites + URLs).

- **`/security whitelist-add`**
- **Type:** Slash
- **Description:** Add a user/role to security whitelist.

- **`/security whitelist-remove`**
- **Type:** Slash
- **Description:** Remove a user/role from security whitelist.

- **`/security whitelist-list`**
- **Type:** Slash
- **Description:** Show security whitelist users + roles.

- **`/backup create`**
- **Type:** Slash
- **Description:** Create a server structure backup (roles/channels/perms) to MongoDB.

- **`/backup list`**
- **Type:** Slash
- **Description:** List recent backups.

- **`/backup info`**
- **Type:** Slash
- **Description:** Show info/details about a backup id.

- **`/backup restore`**
- **Type:** Slash
- **Description:** Restore server structure from backup id (**dangerous**).

- **`/blacklist add`**
- **Type:** Slash
- **Description:** Add a user to the global blacklist (owner-only).

- **`/blacklist remove`**
- **Type:** Slash
- **Description:** Remove a user from the global blacklist (owner-only).

- **`/panic`**
- **Type:** Slash
- **Description:** Emergency: strip dangerous permissions from roles (owner-only).

- **`/setup-security-verify`**
- **Type:** Slash
- **Description:** Deploy the verification gate (button panel) and set the verified role.

- **`/setup-welcome`**
- **Type:** Slash
- **Description:** Deploy the welcome + verify panel.

### Prefix Commands (elora ... / !)

ELORA_SHIELD supports **prefix execution** for some moderation commands via hybrid handlers.

- **`!ban` / `elora ban`**
- **Type:** Prefix
- **Description:** Ban a user.

- **`!kick` / `elora kick`**
- **Type:** Prefix
- **Description:** Kick a user.

- **`!timeout` / `elora timeout`**
- **Type:** Prefix
- **Description:** Timeout a user.

- **`!clear` / `elora clear`**
- **Type:** Prefix
- **Description:** Clear messages.

- **`!warn` / `elora warn`**
- **Type:** Prefix
- **Description:** Warn system (add/list/clear).

### Automated Filters / Systems

- **Arabic Filter**
- **Type:** Automated
- **Description:** Deletes Arabic messages in a specific configured channel.

- **Anti-Link**
- **Type:** Automated
- **Description:** Detects and deletes Discord invites + URLs (toggle via `/security antilink`).

- **Smart Anti-Swear**
- **Type:** Automated
- **Description:** Detects profanity, deletes message, warns user, and applies timeout at threshold.

---

## 💰 ELORA CASINO (Economy & Games)

> CASINO includes both **slash** and **prefix** economy/game commands.

### Slash Commands (/)

- **`/balance`**
- **Type:** Slash
- **Description:** View your (or another user’s) balance/wallet/bank.

- **`/daily`**
- **Type:** Slash
- **Description:** Claim daily reward (24h cooldown).

- **`/leaderboard`**
- **Type:** Slash
- **Description:** Show leaderboard by XP or economy balance.

### Prefix Commands (elora ... / !)

- **`elora slots`**
- **Type:** Prefix
- **Description:** Slot machine betting game (gambling hall only).

- **`elora blackjack`**
- **Type:** Prefix
- **Description:** Blackjack game with buttons (gambling hall only).

- **`elora coinflip`**
- **Type:** Prefix
- **Description:** Coin flip betting (choose heads/tails).

- **`elora crash`**
- **Type:** Prefix
- **Description:** Crash betting game (multiplier simulation).

- **`elora give`**
- **Type:** Prefix
- **Description:** Transfer coins to another user (with tax rules).

- **`elora dep`**
- **Type:** Prefix
- **Description:** Deposit wallet coins to bank.

- **`elora with`**
- **Type:** Prefix
- **Description:** Withdraw bank coins to wallet.

- **`elora heist`**
- **Type:** Prefix
- **Description:** Multi-user heist mini-game with join/start buttons and riddle solving.

- **`elora assets`**
- **Type:** Prefix
- **Description:** Show life-sim portfolio (properties/vehicles/net worth).

- **`elora buy`**
- **Type:** Prefix
- **Description:** Buy life-sim assets (property/vehicle).

- **`elora family`**
- **Type:** Prefix
- **Description:** Dynasty/family management (create/invite/bank/info).

- **`elora job`**
- **Type:** Prefix
- **Description:** Career system (board/work/promotion).

- **`elora partner`**
- **Type:** Prefix
- **Description:** Economic partnership system (propose/accept/status/dissolve).

- **`elora shop`**
- **Type:** Prefix
- **Description:** View life-sim market listings.

---

## 🎵 ELORA DJ (Music & Voice)

### Slash Commands (/)

- **`/play`**
- **Type:** Slash
- **Description:** Play or queue a track by URL or search query.

- **`/skip`**
- **Type:** Slash
- **Description:** Skip the current track.

- **`/stop`**
- **Type:** Slash
- **Description:** Stop playback.

- **`/pause`**
- **Type:** Slash
- **Description:** Pause playback.

- **`/resume`**
- **Type:** Slash
- **Description:** Resume playback.

- **`/queue`**
- **Type:** Slash
- **Description:** Show the current queue (paged).

- **`/247`**
- **Type:** Slash
- **Description:** Summon an available DJ bot into your voice channel (24/7 mode).

---

## 🤝 ELORA HUB (XP, Social & Utilities)

### Slash Commands (/)

- **`/confess`**
- **Type:** Slash
- **Description:** Submit an anonymous confession to the configured confessions channel.

- **`/setup-confessions`**
- **Type:** Slash
- **Description:** Admin-only: configure confessions channel and optional staff log channel.

- **`/settings`**
- **Type:** Slash
- **Description:** Admin-only: open the server control panel (moderation/security toggles).

- **`/chat`**
- **Type:** Slash
- **Description:** Chat with the AI (Gemini) via prompt.

### Prefix Commands (elora ... / !)

- **`elora lvl`**
- **Type:** Prefix
- **Description:** Show the top levels leaderboard (chat + voice).

- **`elora invite`**
- **Type:** Prefix
- **Description:** Show server invite link/info.

- **`elora help`**
- **Type:** Prefix
- **Description:** Show help panel for HUB commands.

- **`elora pic`**
- **Type:** Prefix
- **Description:** Utility image command (posts/returns an image response).

- **`elora bumpreminder`**
- **Type:** Prefix
- **Description:** Manage bump reminder behavior (if enabled in your setup).

- **`elora replypanel`**
- **Type:** Prefix
- **Description:** Manage custom replies panel.

### Automated Systems

- **TikTok/Instagram Link Fixer**
- **Type:** Automated
- **Description:** Rewrites social links to embed-friendly domains and can reupload media via yt-dlp.

- **Custom Replies**
- **Type:** Automated
- **Description:** Auto-replies based on database-defined triggers.

- **XP Leveling**
- **Type:** Automated
- **Description:** Awards chat XP on cooldown and levels up users.
