---
name: postmark-email-handling
description: Use when the user wants to send an email, check email templates, view email delivery stats, or mentions Postmark. Triggers on phrases like "send email", "email someone", "mail the results", "check email stats", "list templates", "delivery report".
user-invocable: false
---

# Postmark Email Handling

Route email-related requests to the appropriate Postmark command.

## When to use

- User asks to send an email, mail something, or notify someone by email
- User mentions Postmark, email templates, delivery stats, or email metrics
- User wants to attach a file and send it to someone

## Routing

| User intent | Command |
|-------------|---------|
| Send an email | `/postmark:send --to <email> --subject <text> --body <text>` |
| Send with attachment | `/postmark:send --to <email> --subject <text> --body <text> --attach <filepath>` |
| Send using a template | `/postmark:template-send --to <email> --template <id-or-alias>` |
| List available templates | `/postmark:templates` |
| Check delivery stats | `/postmark:stats` |
| Check stats for date range | `/postmark:stats --from-date YYYY-MM-DD --to-date YYYY-MM-DD` |
| Check if Postmark is configured | `/postmark:setup` |

## Composing emails

When the user says something like "email Mark the test results":
1. Determine the recipient email (ask if not obvious)
2. Compose a clear subject line
3. Write the body text — professional, concise
4. If there are files to attach, use `--attach`
5. Call `/postmark:send` with the assembled arguments

When writing email body text for `--body`, keep it plain text. If the user wants HTML formatting, use `--html` instead.

## Template emails

If the user wants to use a template:
1. Run `/postmark:templates` first to show available options
2. Ask which template to use (if not specified)
3. Identify required template variables
4. Call `/postmark:template-send` with `--var key=value` for each variable
