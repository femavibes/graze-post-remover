# Graze Post Remover

Monitors Bluesky/Ozone labels in real-time and automatically removes labeled posts from Graze.social feeds.

## How It Works

1. **Connects to Ozone labeler** via WebSocket to receive label events in real-time
2. **Filters for post labels** - Only processes labels applied to posts (AT-URIs), ignores account labels
3. **Matches configured labels** - Checks if the label matches your removal configuration
4. **Removes from Graze feeds** - Makes API calls to remove posts from specified feed IDs
5. **Maintains cursor position** - Saves progress to avoid reprocessing old labels on restart

## Features

- ✅ **Real-time monitoring** - Processes labels as they happen
- ✅ **Multiple feed support** - Remove from specific feeds or all feeds
- ✅ **Hot config reload** - Edit `.env` without restarting
- ✅ **Backfill commands** - Process historical labels for new configurations
- ✅ **Automatic authentication** - Uses Bluesky credentials for stable auth
- ✅ **Cursor persistence** - Resumes from last processed label

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Your labeler's WebSocket URL
LABELER_SOCKET_URL=wss://your-labeler.com/xrpc/com.atproto.label.subscribeLabels?cursor=0

# Label to feed mapping
GRAZE_REMOVAL_LABELS=spam-remove:all,carbrain:3654,nsfw-remove:1234,5678

# Your Bluesky credentials
BSKY_HANDLE=your-handle.bsky.social
BSKY_APP_PASSWORD=your-app-password
```

### 2. Run with Docker

```bash
docker compose up -d
```

## Configuration

### Label Format

Configure labels in `GRAZE_REMOVAL_LABELS` using this format:

```bash
# Remove from all feeds
GRAZE_REMOVAL_LABELS=spam-remove:all

# Remove from specific feed
GRAZE_REMOVAL_LABELS=carbrain:3654

# Remove from multiple feeds
GRAZE_REMOVAL_LABELS=nsfw-remove:1234,5678,9999

# Multiple labels
GRAZE_REMOVAL_LABELS=spam-remove:all,carbrain:3654,nsfw-remove:1234,5678
```

### Hot Reload

Edit `.env` and the app automatically reloads the configuration:

```bash
# Add new label
GRAZE_REMOVAL_LABELS=spam-remove:all,harassment-remove:9999

# The app detects the change and starts monitoring the new label
```

## Backfill Commands

Process historical labels for newly added configurations:

### Basic Usage

```bash
# Backfill last 1000 events (default)
docker compose exec graze-post-remover npm run backfill harassment-remove

# Backfill specific number of events
docker compose exec graze-post-remover npm run backfill spam-remove 500

# Backfill everything from the beginning
docker compose exec graze-post-remover npm run backfill nsfw-remove all
```

### Examples

```bash
# You add a new label to .env
GRAZE_REMOVAL_LABELS=carbrain:3654,new-label:9999

# Backfill the last 2000 events for the new label
docker compose exec graze-post-remover npm run backfill new-label 2000

# The main app keeps running and processes new labels in real-time
```

## Workflow

1. **Start the app** - `docker compose up -d`
2. **Add new labels** - Edit `GRAZE_REMOVAL_LABELS` in `.env`
3. **Config auto-reloads** - App detects changes and starts monitoring new labels
4. **Backfill if needed** - Run backfill command for historical posts
5. **Monitor logs** - Watch real-time processing: `docker compose logs -f`

## Authentication

The app uses your Bluesky credentials to authenticate with Graze:

1. **Login to Graze** using your Bluesky handle and app password
2. **Extract session cookie** from the login response
3. **Use cookie for API calls** to remove posts
4. **Auto-refresh** when session expires

## Monitoring

### View Logs

```bash
# Real-time logs
docker compose logs -f

# Recent logs
docker compose logs --tail=50
```

### Log Messages

```bash
# Normal operation
Processing label "carbrain" for post: at://did:plc:abc123/app.bsky.feed.post/xyz789
Removed post from feed 3654
Successfully processed removal for at://did:plc:abc123/app.bsky.feed.post/xyz789

# Config reload
[CONFIG] .env file changed, reloading configuration...
[CONFIG] Configuration reloaded successfully
[CONFIG] Active labels: carbrain,spam-remove

# Backfill
[BACKFILL] Starting backfill for "harassment-remove" from cursor 4000
[BACKFILL] Processing "harassment-remove" for post: at://...
[BACKFILL] Completed! Processed 15 "harassment-remove" labels
```

## Troubleshooting

### Authentication Issues

If you see "fetch failed" errors:

1. **Update session cookie** - Login to Graze and get fresh session cookie
2. **Check credentials** - Verify `BSKY_HANDLE` and `BSKY_APP_PASSWORD`
3. **Restart app** - `docker compose restart`

### Cursor Issues

If the app reprocesses old labels:

1. **Check cursor file** - `docker compose exec graze-post-remover cat data/cursor.txt`
2. **Verify persistence** - Ensure `./data` volume is mounted correctly

### Config Not Reloading

If changes to `.env` aren't detected:

1. **Check file watcher** - Look for "[CONFIG]" messages in logs
2. **Restart if needed** - `docker compose restart`

## Development

### Local Development

```bash
npm install
npm run dev
```

### Build

```bash
docker compose build
```

## License

MIT