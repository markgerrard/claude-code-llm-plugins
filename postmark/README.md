# Postmark Plugin for Claude Code

Send emails, use templates, and check delivery stats from Claude Code via the Postmark API.

## Commands

| Command | Description |
|---------|-------------|
| `/postmark:setup` | Check configuration and connectivity |
| `/postmark:send` | Send an email |
| `/postmark:template-send` | Send using a Postmark template |
| `/postmark:templates` | List available templates |
| `/postmark:stats` | Delivery statistics |

## Setup

Set your Postmark credentials in `~/.postmark/.env`:

```
POSTMARK_SERVER_TOKEN=your-server-token
DEFAULT_SENDER_EMAIL=claude@yourdomain.com
DEFAULT_MESSAGE_STREAM=outbound
```

Get your server token at https://account.postmarkapp.com/servers

## Usage

### Send an email

```
/postmark:send --to user@example.com --subject "Hello" --body "Message text"
```

### Send with attachment

```
/postmark:send --to user@example.com --subject "Report" --body "See attached" --attach /path/to/file.pdf
```

### Send using a template

```
/postmark:templates                    # list available templates first
/postmark:template-send --to user@example.com --template welcome-email --var name=Mark
```

### Check delivery stats

```
/postmark:stats
/postmark:stats --from-date 2026-04-01 --to-date 2026-04-03
/postmark:stats --tag onboarding
```

### Natural language

The plugin also responds to natural language:

- "Email Mark the test results"
- "Send the deployment report to the team"
- "How are our email open rates?"
- "List our email templates"

## Part of [cc-plugins](https://github.com/markgerrard/cc-plugins)

Install with all other plugins: `./install.sh` or standalone: `./install.sh postmark`
