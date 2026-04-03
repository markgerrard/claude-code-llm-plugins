---
name: gdrive-file-handling
description: Use when the user wants to upload, download, list, search, or manage files on Google Drive. Triggers on phrases like "upload to drive", "find on drive", "save to google drive", "download from drive", "list drive files", "create a folder on drive".
user-invocable: false
---

# Google Drive File Handling

Route file management requests to the appropriate Google Drive command.

## When to use

- User asks to upload, download, share, or find files on Google Drive
- User mentions Google Drive, Drive, or cloud storage
- User wants to back up files or share documents

## Routing

| User intent | Command |
|-------------|---------|
| List files in Drive | `/gdrive:list` |
| List files in a folder | `/gdrive:list --folder <id>` |
| Search for a file | `/gdrive:search <query>` |
| Upload a file | `/gdrive:upload <path> [--folder <id>]` |
| Download a file | `/gdrive:download <file-id> <save-path>` |
| Create a folder | `/gdrive:mkdir <name>` |
| Delete/trash a file | `/gdrive:trash <file-id>` |
| Check if Drive is set up | `/gdrive:setup` |

## Workflow for uploads

When the user says "upload X to Drive":
1. Verify the local file exists
2. Call `/gdrive:upload <path>`
3. Report the Drive link from the result

## Workflow for downloads

When the user says "download X from Drive":
1. If they give a file name (not ID), search first: `/gdrive:search <name>`
2. Use the file ID from results
3. Call `/gdrive:download <file-id> <save-path>`

## Google Workspace exports

Google Docs, Sheets, and Slides are exported automatically:
- Docs → PDF
- Sheets → CSV
- Slides → PDF
- Drawings → PNG
